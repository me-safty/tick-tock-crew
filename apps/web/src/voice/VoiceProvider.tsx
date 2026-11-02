import { api } from "@tick-tock-crew/backend/api"
import { useAction, useMutation, useQuery } from "convex/react"
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react"
import { sessionId } from "../guest"
import type { Lobby } from "../roles"
import { PeerLink } from "./PeerLink"
import { decodeSignal, encodeSignal, isPolite, type MicState, type Role, routeSignal } from "./protocol"
import { useMicrophone } from "./useMicrophone"
import { useSpeaking, type VoiceSource } from "./useSpeaking"

type Voice = ReturnType<typeof useMicrophone> & {
  /** The caller's seat, or null when they hold none and so aren't in the call. */
  readonly me: Role | null
  readonly speaking: ReadonlySet<Role>
  readonly links: ReadonlyMap<Role, PeerStatus>
}

/** A link's connection and what its player's mic is doing, as their heartbeats last said. */
type PeerStatus = { readonly connection: RTCPeerConnectionState; readonly mic: MicState }

const VoiceContext = createContext<Voice | null>(null)

export function useVoice() {
  const voice = useContext(VoiceContext)
  if (!voice) throw new Error("useVoice needs a VoiceProvider")
  return voice
}

/** Joins the room's voice call from the caller's seat, with every other seated player. */
export function VoiceProvider({ lobby, children }: { readonly lobby: Lobby; readonly children: ReactNode }) {
  const me = lobby.seats.find((seat) => seat.player?.isYou)?.role ?? null
  const others = lobby.seats.filter((seat) => seat.player && !seat.player.isYou).map((seat) => seat.role)
  // A new array on every lobby update would rebuild the links, so only a different set of seats makes a new one.
  const peerKey = others.join(",")
  const peers = useMemo(() => others, [peerKey])
  const mic = useMicrophone({ enabled: me !== null })
  const micState: MicState = mic.track ? (mic.muted ? "muted" : "live") : "off"
  const { streams, links } = useMesh({ code: lobby.code, me, peers, track: mic.track, mic: micState })
  const sources = useMemo(() => {
    const voices: VoiceSource[] = [...streams].map(([role, stream]) => ({ role, stream }))
    return me && mic.track ? [...voices, { role: me, stream: new MediaStream([mic.track]) }] : voices
  }, [streams, me, mic.track])
  const speaking = useSpeaking(sources)
  useMuteKey({ enabled: mic.track !== null, toggle: mic.toggleMute })
  return (
    <VoiceContext value={{ ...mic, me, speaking, links }}>
      {children}
      {[...streams].map(([role, stream]) => (
        <RemoteAudio key={role} stream={stream} />
      ))}
    </VoiceContext>
  )
}

function useIceServers({ code, seated }: { code: string; seated: boolean }) {
  const fetchIceServers = useAction(api.voice.iceServers)
  const [servers, setServers] = useState<RTCIceServer[] | null>(null)
  useEffect(() => {
    if (!seated) return
    let cancelled = false
    fetchIceServers({ code, sessionId }).then(
      (fetched) => !cancelled && setServers(fetched),
      // Without the action, host candidates still connect players on the same network.
      () => !cancelled && setServers([]),
    )
    return () => {
      cancelled = true
    }
  }, [code, seated, fetchIceServers])
  return servers
}

/** A PeerLink to each peer, rebuilt when our seat changes and fed from our seat's signal inbox. */
function useMesh({
  code,
  me,
  peers,
  track,
  mic,
}: {
  code: string
  me: Role | null
  peers: ReadonlyArray<Role>
  track: MediaStreamTrack | null
  mic: MicState
}) {
  const iceServers = useIceServers({ code, seated: me !== null })
  const sendSignal = useMutation(api.voice.signal)
  const ack = useMutation(api.voice.ack)
  const inbox = useQuery(api.voice.inbox, me ? { code, sessionId } : "skip")
  const linksRef = useRef(new Map<Role, PeerLink>())
  const handled = useRef(new Set<string>())
  const trackRef = useRef(track)
  const micRef = useRef(mic)
  const [streams, setStreams] = useState<ReadonlyMap<Role, MediaStream>>(new Map())
  const [links, setLinks] = useState<ReadonlyMap<Role, PeerStatus>>(new Map())

  const forget = (peer: Role) => {
    const without = <T,>(map: ReadonlyMap<Role, T>) => new Map([...map].filter(([role]) => role !== peer))
    setStreams(without)
    setLinks(without)
  }

  const open = (peer: Role, remoteId: string | null) => {
    if (!me || !iceServers) return null
    linksRef.current.get(peer)?.close()
    forget(peer)
    const current = () => linksRef.current.get(peer) === link
    const link: PeerLink = new PeerLink({
      polite: isPolite({ me, peer }),
      iceServers,
      remoteId,
      track: trackRef.current,
      mic: micRef.current,
      send: (signal) => void sendSignal({ code, sessionId, toRole: peer, ...encodeSignal(signal) }).catch(() => undefined),
      onStream: (stream) => current() && setStreams((map) => new Map(map).set(peer, stream)),
      onState: (connection) => current() && setLinks((map) => updated(map, peer, { connection })),
      onRemoteMic: (remoteMic) => current() && setLinks((map) => updated(map, peer, { mic: remoteMic })),
    })
    linksRef.current.set(peer, link)
    setLinks((map) => new Map(map).set(peer, { connection: "new", mic: "live" }))
    return link
  }

  useEffect(() => {
    const links = linksRef.current
    return () => {
      for (const link of links.values()) link.close()
      links.clear()
      handled.current.clear()
      setStreams(new Map())
      setLinks(new Map())
    }
  }, [me, iceServers])

  useEffect(() => {
    for (const peer of peers) if (!linksRef.current.has(peer)) open(peer, null)
    for (const [peer, link] of linksRef.current) {
      if (peers.includes(peer)) continue
      link.close()
      linksRef.current.delete(peer)
      forget(peer)
    }
  }, [me, iceServers, peers])

  useEffect(() => {
    micRef.current = mic
    for (const link of linksRef.current.values()) link.setMic(mic)
  }, [mic])

  useEffect(() => {
    trackRef.current = track
    for (const link of linksRef.current.values()) link.setTrack(track)
  }, [track])

  useEffect(() => {
    if (!inbox || !me || !iceServers) return
    const read: typeof inbox = []
    for (const row of inbox) {
      if (handled.current.has(row.id)) continue
      handled.current.add(row.id)
      read.push(row)
      // Convex updates the lobby and inbox queries together, so a sender without a link has left its seat.
      const link = linksRef.current.get(row.fromRole)
      if (!link) continue
      const signal = decodeSignal(row)
      if (!signal) continue
      const route = routeSignal(link, signal)
      switch (route) {
        case "deliver":
          link.receive(signal)
          break
        case "adopt":
          link.remoteId = signal.from
          link.receive(signal)
          break
        case "reset":
          open(row.fromRole, signal.from)?.receive(signal)
          break
        case "drop":
          break
        default: {
          const _exhaustive: never = route
          return _exhaustive
        }
      }
    }
    if (read.length > 0) void ack({ code, sessionId, ids: read.map((row) => row.id) }).catch(() => undefined)
  }, [inbox, me, iceServers, peers])

  return { streams, links }
}

function updated(map: ReadonlyMap<Role, PeerStatus>, peer: Role, change: Partial<PeerStatus>) {
  const current = map.get(peer)
  return current ? new Map(map).set(peer, { ...current, ...change }) : map
}

/** Plays a peer's voice. Chrome also needs a remote stream playing in a media element before WebAudio can meter it. */
function RemoteAudio({ stream }: { readonly stream: MediaStream }) {
  const audio = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const element = audio.current
    if (!element) return
    element.srcObject = stream
    const play = () => void element.play().catch(() => undefined)
    play()
    // Autoplay waits for the first interaction after a reload.
    window.addEventListener("pointerdown", play, { once: true })
    window.addEventListener("keydown", play, { once: true })
    return () => {
      window.removeEventListener("pointerdown", play)
      window.removeEventListener("keydown", play)
    }
  }, [stream])
  return <audio ref={audio} autoPlay />
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

/** M toggles the mic anywhere but in a text field, on any keyboard layout. */
function useMuteKey({ enabled, toggle }: { enabled: boolean; toggle: () => void }) {
  const latest = useRef(toggle)
  latest.current = toggle
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyM" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
      latest.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [enabled])
}
