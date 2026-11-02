import { api } from "@tick-tock-crew/backend/api"
import { useConvex, useMutation } from "convex/react"
import { useEffect } from "react"
import { sessionId } from "./guest"

const INTERVAL_MS = 10_000
/**
 * The interval a hidden tab reports. The server times a session out after 2.5 intervals, and browsers may slow a
 * hidden tab's timers to one a minute, so this keeps a player who switched tabs online.
 */
const HIDDEN_INTERVAL_MS = 30_000

/**
 * Keeps this tab in the room's presence. Unlike usePresence from @convex-dev/presence, it keeps beating while the
 * tab is hidden: only a closed tab or a lost connection takes a player offline.
 */
export function useRoomPresence(code: string) {
  const convex = useConvex()
  const heartbeat = useMutation(api.presence.heartbeat)
  const disconnect = useMutation(api.presence.disconnect)
  useEffect(() => {
    const tab = crypto.randomUUID()
    let token: string | null = null
    let left = false
    const beat = () => {
      const interval = document.hidden ? HIDDEN_INTERVAL_MS : INTERVAL_MS
      heartbeat({ roomId: code, userId: sessionId, sessionId: tab, interval }).then(
        ({ sessionToken }) => {
          if (left) void disconnect({ sessionToken })
          else token = sessionToken
        },
        // A missed beat is retried by the next one.
        () => undefined,
      )
    }
    // The beacon still goes out while the page unloads, when a mutation over the socket would not.
    const leave = () => {
      if (!token) return
      const body = JSON.stringify({ path: "presence:disconnect", args: { sessionToken: token } })
      navigator.sendBeacon(`${convex.url}/api/mutation`, new Blob([body], { type: "application/json" }))
    }
    beat()
    const id = setInterval(beat, INTERVAL_MS)
    // Beating on every change tells the server the new interval straight away.
    document.addEventListener("visibilitychange", beat)
    window.addEventListener("pagehide", leave)
    return () => {
      left = true
      clearInterval(id)
      document.removeEventListener("visibilitychange", beat)
      window.removeEventListener("pagehide", leave)
      if (token) void disconnect({ sessionToken: token })
    }
  }, [code, convex, heartbeat, disconnect])
}
