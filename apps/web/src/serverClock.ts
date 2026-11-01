import { api } from "@tick-tock-crew/backend/api"
import { useMutation } from "convex/react"
import { type RefObject, useEffect, useRef } from "react"

/** One round trip to the server's clock, with local times on either side. */
export type ClockSample = { readonly sentAt: number; readonly serverTime: number; readonly receivedAt: number }

const SAMPLES = 5

/**
 * Server time minus local time. The server read its clock somewhere inside the round trip, so the shortest trip
 * pins that moment down best; its midpoint is the guess.
 */
export function clockOffset(samples: ReadonlyArray<ClockSample>) {
  const [first, ...rest] = samples
  if (!first) return 0
  const tightest = rest.reduce(
    (best, sample) => (sample.receivedAt - sample.sentAt < best.receivedAt - best.sentAt ? sample : best),
    first,
  )
  return tightest.serverTime - (tightest.sentAt + tightest.receivedAt) / 2
}

/** Measures the offset to the server's clock once, when `enabled`; until then the ref reads 0. */
export function useServerClockOffset(enabled: boolean): RefObject<number> {
  const serverTime = useMutation(api.match.serverTime)
  const offset = useRef(0)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const measure = async () => {
      const samples: ClockSample[] = []
      for (let i = 0; i < SAMPLES && !cancelled; i++) {
        const sentAt = Date.now()
        const time = await serverTime({})
        samples.push({ sentAt, serverTime: time, receivedAt: Date.now() })
      }
      if (!cancelled) offset.current = clockOffset(samples)
    }
    // Without a measurement the gauge runs on local time, which is only off by this device's clock skew.
    measure().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled, serverTime])
  return offset
}
