import { type ChannelMessage, decodeMessage, encodeMessage, isFresh, type MicState, type Signal } from "./protocol"

const HEARTBEAT_MS = 2_000

type PeerLinkOptions = {
  readonly polite: boolean
  readonly iceServers: RTCIceServer[]
  /** The remote connection this one answers, when a fresh offer from it started this link. */
  readonly remoteId: string | null
  readonly track: MediaStreamTrack | null
  readonly mic: MicState
  readonly send: (signal: Signal) => void
  readonly onStream: (stream: MediaStream) => void
  readonly onState: (state: RTCPeerConnectionState) => void
  readonly onRemoteMic: (mic: MicState) => void
}

type Connection = { readonly pc: RTCPeerConnection; readonly channel: RTCDataChannel }

/**
 * One link to one other seat, carrying our mic and an unreliable data channel, negotiated with the perfect
 * negotiation pattern. When both sides make their first offer at once, the polite side answers on a fresh
 * RTCPeerConnection instead of rolling back: Chrome can reject the data channel's m-line after rolling back an offer
 * that carried it, which leaves the link with no transport at all.
 */
export class PeerLink {
  /** Names this end of the link in signals; it outlives the RTCPeerConnections the link replaces. */
  readonly localId = crypto.randomUUID()
  remoteId: string | null
  private readonly options: PeerLinkOptions
  private connection: Connection
  private track: MediaStreamTrack | null
  private mic: MicState
  private makingOffer = false
  private ignoreOffer = false
  private queue: Promise<void> = Promise.resolve()
  private sentSeq = 0
  private heardSeq = 0
  private readonly heartbeat: ReturnType<typeof setInterval>

  constructor(options: PeerLinkOptions) {
    this.options = options
    this.remoteId = options.remoteId
    this.track = options.track
    this.mic = options.mic
    this.connection = this.connect()
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS)
  }

  /** Signals are handled one at a time, in the order they arrive. */
  receive(signal: Signal) {
    this.queue = this.queue.then(() => this.handle(signal)).catch(() => undefined)
  }

  /** Sends our mic on this link, or silence for null. A link without a sender adds one and renegotiates. */
  setTrack(track: MediaStreamTrack | null) {
    this.track = track
    const { pc } = this.connection
    const sender = pc
      .getTransceivers()
      .find(({ receiver, direction }) => receiver.track.kind === "audio" && (direction === "sendrecv" || direction === "sendonly"))
      ?.sender
    if (sender) void sender.replaceTrack(track).catch(() => undefined)
    else if (track) pc.addTrack(track)
  }

  /** Tells the peer our mic state now rather than at the next heartbeat. */
  setMic(mic: MicState) {
    if (mic === this.mic) return
    this.mic = mic
    this.beat()
  }

  close() {
    clearInterval(this.heartbeat)
    this.connection.channel.close()
    this.connection.pc.close()
  }

  private connect(): Connection {
    const { options } = this
    const pc = new RTCPeerConnection({ iceServers: options.iceServers })
    const current = () => this.connection.pc === pc
    // Negotiated with a fixed id on both sides, so glare never leaves two channels.
    const channel = pc.createDataChannel("crew", { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 })
    channel.onmessage = ({ data }) => this.take(decodeMessage(data))
    channel.onopen = () => this.beat()
    if (this.track) pc.addTrack(this.track)
    pc.onnegotiationneeded = () => {
      if (!current()) return
      this.makingOffer = true
      pc.setLocalDescription()
        .then(() => this.sendDescription())
        .catch(() => undefined)
        .finally(() => {
          this.makingOffer = false
        })
    }
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && current()) options.send({ kind: "ice", from: this.localId, to: this.remoteId, candidate: candidate.toJSON() })
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") pc.restartIce()
    }
    pc.onconnectionstatechange = () => current() && options.onState(pc.connectionState)
    pc.ontrack = ({ track }) => current() && options.onStream(new MediaStream([track]))
    return { pc, channel }
  }

  private beat() {
    this.post({ kind: "heartbeat", seq: ++this.sentSeq, at: Date.now(), mic: this.mic })
  }

  private post(message: ChannelMessage) {
    const { channel } = this.connection
    if (channel.readyState === "open") channel.send(encodeMessage(message))
  }

  private take(message: ChannelMessage | null) {
    if (!message || !isFresh({ lastSeq: this.heardSeq, seq: message.seq })) return
    this.heardSeq = message.seq
    this.options.onRemoteMic(message.mic)
  }

  private sendDescription() {
    const description = this.connection.pc.localDescription
    if (description?.type !== "offer" && description?.type !== "answer") return
    this.options.send({ kind: description.type, from: this.localId, to: this.remoteId, sdp: description.sdp })
  }

  private async handle(signal: Signal) {
    if (signal.kind === "ice") {
      try {
        await this.connection.pc.addIceCandidate(signal.candidate)
      } catch (error) {
        // Candidates for an offer we ignored fail to apply; anything else is a real failure.
        if (!this.ignoreOffer) throw error
      }
      return
    }
    const { pc } = this.connection
    const collision = signal.kind === "offer" && (this.makingOffer || pc.signalingState !== "stable")
    this.ignoreOffer = !this.options.polite && collision
    if (this.ignoreOffer) return
    if (collision && pc.remoteDescription === null) {
      this.connection.channel.close()
      pc.close()
      this.makingOffer = false
      this.connection = this.connect()
    }
    await this.connection.pc.setRemoteDescription({ type: signal.kind, sdp: signal.sdp })
    if (signal.kind === "offer") {
      await this.connection.pc.setLocalDescription()
      this.sendDescription()
    }
  }
}
