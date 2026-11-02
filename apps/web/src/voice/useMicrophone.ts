import { useCallback, useEffect, useRef, useState } from "react"

/** Where the player's mic stands. Without one they can still hear the crew. */
export type Mic =
  | { readonly kind: "off" }
  | { readonly kind: "asking" }
  | { readonly kind: "on"; readonly track: MediaStreamTrack }
  | { readonly kind: "denied" }
  | { readonly kind: "unavailable" }

const DEVICE_KEY = "ttc.micDevice"

const constraints = (deviceId: string): MediaStreamConstraints => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  },
})

async function openTrack(deviceId: string) {
  try {
    return (await navigator.mediaDevices.getUserMedia(constraints(deviceId))).getAudioTracks()[0] ?? null
  } catch (error) {
    // A remembered device that has since been unplugged: take the default one instead.
    if (deviceId && error instanceof DOMException && error.name === "OverconstrainedError") return openTrack("")
    throw error
  }
}

// Chrome lists aliases for the system default alongside the real inputs; the picker has its own default entry.
const audioInputs = (all: ReadonlyArray<MediaDeviceInfo>) =>
  all.filter((device) => device.kind === "audioinput" && device.deviceId !== "default" && device.deviceId !== "communications")

const isDenial = (error: unknown) =>
  error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")

/** The player's microphone with echo cancellation, noise suppression and auto gain; a mute and an input picker. */
export function useMicrophone({ enabled }: { enabled: boolean }) {
  const [mic, setMic] = useState<Mic>({ kind: "off" })
  const [muted, setMuted] = useState(false)
  const [devices, setDevices] = useState<ReadonlyArray<MediaDeviceInfo>>([])
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem(DEVICE_KEY) ?? "")
  const live = useRef<MediaStreamTrack | null>(null)
  const attempt = useRef(0)

  const start = useCallback(async (device: string) => {
    const id = ++attempt.current
    if (!live.current) setMic({ kind: "asking" })
    try {
      const track = await openTrack(device)
      if (id !== attempt.current) {
        track?.stop()
        return
      }
      live.current?.stop()
      live.current = track
      setMic(track ? { kind: "on", track } : { kind: "unavailable" })
      setDevices(audioInputs(await navigator.mediaDevices.enumerateDevices()))
    } catch (error) {
      if (id !== attempt.current || live.current) return
      setMic({ kind: isDenial(error) ? "denied" : "unavailable" })
    }
  }, [])

  // A mic the browser already allows for this site turns on by itself once the player has a seat; otherwise the
  // player is asked first. Leaving the seat turns it off.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    navigator.permissions
      ?.query({ name: "microphone" })
      .then((status) => {
        if (cancelled) return
        if (status.state === "granted") void start(localStorage.getItem(DEVICE_KEY) ?? "")
        if (status.state === "denied") setMic({ kind: "denied" })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      attempt.current++
      live.current?.stop()
      live.current = null
      setMic({ kind: "off" })
    }
  }, [start, enabled])

  const track = mic.kind === "on" ? mic.track : null
  useEffect(() => {
    if (track) track.enabled = !muted
  }, [track, muted])

  useEffect(() => {
    const refresh = () =>
      void navigator.mediaDevices
        .enumerateDevices()
        .then((all) => setDevices(audioInputs(all)))
        .catch(() => undefined)
    navigator.mediaDevices?.addEventListener("devicechange", refresh)
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refresh)
  }, [])

  return {
    mic,
    track,
    muted,
    devices,
    deviceId,
    enable: () => void start(deviceId),
    toggleMute: () => setMuted((current) => !current),
    selectDevice: (next: string) => {
      setDeviceId(next)
      localStorage.setItem(DEVICE_KEY, next)
      void start(next)
    },
  }
}
