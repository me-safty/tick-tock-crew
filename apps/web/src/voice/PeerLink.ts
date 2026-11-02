import { type ChannelMessage, decodeMessage, encodeMessage, isFresh, type Signal } from "./protocol"

const HEARTBEAT_MS = 2_000

type PeerLinkOptions = {
  readonly polite: boolean
  readonly iceServers: RTCIceServer[]
  /** The remote connection this one answers, when a fresh offer from it started this link. */
  readonly remoteId: string | null
  readonly track: MediaStreamTrack | null
  readonly send: (signal: Signal) => void
  readonly onStream: (stream: MediaStream) => void
  readonly onState: (state: RTCPeerConnectionState) => void
}

/**
 * One RTCPeerConnection to one other seat, negotiated with the perfect negotiation pattern, carrying our mic and
 * an unreliable data channel.
 */
export class PeerLink {
  readonly localId = crypto.randomUUID()
  remoteId: string | null
  private readonly pc: RTCPeerConnection
  private readonly channel: RTCDataChannel
  private readonly options: PeerLinkOptions
  private makingOffer = false
  private ignoreOffer = false
  private queue: Promise<void> = Promise.resolve()
  private sentSeq = 0
  private heardSeq = 0
  private readonly heartbeat: ReturnType<typeof setInterval>

  constructor(options: PeerLinkOptions) {
    this.options = options
    this.remoteId = options.remoteId
    const pc = new RTCPeerConnection({ iceServers: options.iceServers })
    this.pc = pc
    // Negotiated with a fixed id on both sides, so glare never leaves two channels.
    this.channel = pc.createDataChannel("crew", { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 })
    this.channel.onmessage = ({ data }) => this.take(decodeMessage(data))
    if (options.track) pc.addTrack(options.track)

    pc.onnegotiationneeded = () => {
      this.makingOffer = true
      pc.setLocalDescription()
        .then(() => this.sendDescription())
        .catch(() => undefined)
        .finally(() => {
          this.makingOffer = false
        })
    }
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) options.send({ kind: "ice", from: this.localId, to: this.remoteId, candidate: candidate.toJSON() })
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") pc.restartIce()
    }
    pc.onconnectionstatechange = () => options.onState(pc.connectionState)
    pc.ontrack = ({ track }) => options.onStream(new MediaStream([track]))
    this.heartbeat = setInterval(() => this.post({ kind: "heartbeat", seq: ++this.sentSeq, at: Date.now() }), HEARTBEAT_MS)
  }

  /** Signals are handled one at a time, in the order they arrive. */
  receive(signal: Signal) {
    this.queue = this.queue.then(() => this.handle(signal)).catch(() => undefined)
  }

  /** Sends our mic on this link, or silence for null. A link without a sender adds one and renegotiates. */
  setTrack(track: MediaStreamTrack | null) {
    const sender = this.pc
      .getTransceivers()
      .find(({ receiver, direction }) => receiver.track.kind === "audio" && (direction === "sendrecv" || direction === "sendonly"))
      ?.sender
    if (sender) void sender.replaceTrack(track).catch(() => undefined)
    else if (track) this.pc.addTrack(track)
  }

  close() {
    clearInterval(this.heartbeat)
    this.channel.close()
    this.pc.close()
  }

  private post(message: ChannelMessage) {
    if (this.channel.readyState === "open") this.channel.send(encodeMessage(message))
  }

  private take(message: ChannelMessage | null) {
    if (!message || !isFresh({ lastSeq: this.heardSeq, seq: message.seq })) return
    this.heardSeq = message.seq
  }

  private sendDescription() {
    const description = this.pc.localDescription
    if (description?.type !== "offer" && description?.type !== "answer") return
    this.options.send({ kind: description.type, from: this.localId, to: this.remoteId, sdp: description.sdp })
  }

  private async handle(signal: Signal) {
    const { pc } = this
    if (signal.kind === "ice") {
      try {
        await pc.addIceCandidate(signal.candidate)
      } catch (error) {
        // Candidates for an offer we ignored fail to apply; anything else is a real failure.
        if (!this.ignoreOffer) throw error
      }
      return
    }
    const collision = signal.kind === "offer" && (this.makingOffer || pc.signalingState !== "stable")
    this.ignoreOffer = !this.options.polite && collision
    if (this.ignoreOffer) return
    await pc.setRemoteDescription({ type: signal.kind, sdp: signal.sdp })
    if (signal.kind === "offer") {
      await pc.setLocalDescription()
      this.sendDescription()
    }
  }
}
