import { api } from "@tick-tock-crew/backend/api"
import { useQuery } from "convex/react"
import { useTranslation } from "react-i18next"
import { sessionId } from "./guest"
import { LobbyScreen } from "./LobbyScreen"
import { MatchScreen } from "./MatchScreen"
import type { Lobby } from "./roles"
import { useRoomPresence } from "./presence"
import { navigate } from "./router"
import { VoiceProvider } from "./voice/VoiceProvider"

export function Room({ code }: { readonly code: string }) {
  const { t } = useTranslation()
  const lobby = useQuery(api.rooms.lobby, { code, sessionId })
  if (lobby === undefined) {
    return (
      <main className="screen">
        <p className="muted">{t("room.connecting")}</p>
      </main>
    )
  }
  if (lobby === null) {
    return (
      <main className="screen">
        <section className="panel">
          <h1>{t("room.notFound", { code })}</h1>
          <p className="muted">{t("room.notFoundHint")}</p>
          <button type="button" className="button primary" onClick={() => navigate("/")}>
            {t("common.backHome")}
          </button>
        </section>
      </main>
    )
  }
  return <JoinedRoom lobby={lobby} />
}

function JoinedRoom({ lobby }: { readonly lobby: Lobby }) {
  useRoomPresence(lobby.code)
  return (
    <VoiceProvider lobby={lobby}>
      <RoomScreen lobby={lobby} />
    </VoiceProvider>
  )
}

function RoomScreen({ lobby }: { readonly lobby: Lobby }) {
  switch (lobby.status) {
    case "lobby":
      return <LobbyScreen lobby={lobby} />
    case "playing":
    case "won":
    case "lost":
      return <MatchScreen lobby={lobby} />
    default: {
      const _exhaustive: never = lobby.status
      return _exhaustive
    }
  }
}
