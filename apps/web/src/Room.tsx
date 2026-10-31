import usePresence from "@convex-dev/presence/react"
import { api } from "@tick-tock-crew/backend/api"
import { useQuery } from "convex/react"
import { sessionId } from "./guest"
import { LobbyScreen } from "./LobbyScreen"
import { MatchStarted } from "./MatchStarted"
import type { Lobby } from "./roles"
import { navigate } from "./router"

export function Room({ code }: { readonly code: string }) {
  const lobby = useQuery(api.rooms.lobby, { code, sessionId })
  if (lobby === undefined) {
    return (
      <main className="screen">
        <p className="muted">Connecting…</p>
      </main>
    )
  }
  if (lobby === null) {
    return (
      <main className="screen">
        <section className="panel">
          <h1>Room {code} not found</h1>
          <p className="muted">Check the code with whoever sent it.</p>
          <button type="button" className="button primary" onClick={() => navigate("/")}>
            Back to home
          </button>
        </section>
      </main>
    )
  }
  return <JoinedRoom lobby={lobby} />
}

function JoinedRoom({ lobby }: { readonly lobby: Lobby }) {
  usePresence(api.presence, lobby.code, sessionId)
  switch (lobby.status) {
    case "lobby":
      return <LobbyScreen lobby={lobby} />
    case "playing":
      return <MatchStarted lobby={lobby} />
    default: {
      const _exhaustive: never = lobby.status
      return _exhaustive
    }
  }
}
