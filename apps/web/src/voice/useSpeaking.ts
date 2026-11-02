import { useEffect, useState } from "react"
import type { Role } from "./protocol"

const SAMPLE_MS = 100
/** RMS of the waveform above which a voice counts as speaking; the mic's own noise suppression keeps hiss below it. */
const SPEAKING_LEVEL = 0.02
/** Keeps the indicator on through the short gaps between words. */
const HOLD_MS = 300

export type VoiceSource = { readonly role: Role; readonly stream: MediaStream }

function rms(samples: Float32Array<ArrayBuffer>) {
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.sqrt(sum / samples.length)
}

/** Which roles are talking right now, from a WebAudio analyser on each voice. */
export function useSpeaking(sources: ReadonlyArray<VoiceSource>): ReadonlySet<Role> {
  const [speaking, setSpeaking] = useState<ReadonlySet<Role>>(new Set())
  useEffect(() => {
    if (sources.length === 0) {
      setSpeaking(new Set())
      return
    }
    const context = new AudioContext()
    const meters = sources.map(({ role, stream }) => {
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(stream).connect(analyser)
      return { role, analyser, samples: new Float32Array(analyser.fftSize), loudAt: -Infinity }
    })
    // Browsers start audio suspended until the page has been interacted with.
    const resume = () => void context.resume().catch(() => undefined)
    resume()
    window.addEventListener("pointerdown", resume)
    window.addEventListener("keydown", resume)
    const id = setInterval(() => {
      const now = performance.now()
      const next = new Set<Role>()
      for (const meter of meters) {
        meter.analyser.getFloatTimeDomainData(meter.samples)
        if (rms(meter.samples) > SPEAKING_LEVEL) meter.loudAt = now
        if (now - meter.loudAt < HOLD_MS) next.add(meter.role)
      }
      setSpeaking((current) => (current.size === next.size && [...next].every((role) => current.has(role)) ? current : next))
    }, SAMPLE_MS)
    return () => {
      clearInterval(id)
      window.removeEventListener("pointerdown", resume)
      window.removeEventListener("keydown", resume)
      void context.close().catch(() => undefined)
    }
  }, [sources])
  return speaking
}
