import { api } from "@tick-tock-crew/backend/api"
import { useMutation } from "convex/react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutationError } from "./errors"
import { sessionId, useNickname } from "./guest"
import { intlLocale, useLanguage } from "./i18n"
import { LanguageSwitch } from "./i18n/LanguageSwitch"
import { preloadScene } from "./MatchScreen"
import type { Lobby, Seat } from "./roles"

export function LobbyScreen({ lobby }: { readonly lobby: Lobby }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [nickname, setNickname] = useNickname()
  const { error, run } = useMutationError()
  const claimSeat = useMutation(api.rooms.claimSeat)
  const leaveSeat = useMutation(api.rooms.leaveSeat)
  const setReady = useMutation(api.rooms.setReady)
  const startMatch = useMutation(api.rooms.startMatch)
  useEffect(() => {
    void preloadScene()
  }, [])

  const room = { code: lobby.code, sessionId }
  const seated = lobby.seats.some((seat) => seat.player?.isYou)
  const waitingFor = lobby.seats
    .filter((seat) => !(seat.player?.ready && seat.player.online))
    .map((seat) => seat.player?.name ?? t("lobby.openSeatOf", { role: t(`roles.${seat.role}.title`) }))
  const allReady = waitingFor.length === 0

  return (
    <main className="screen lobby">
      <header className="lobby-header">
        <div>
          <span className="eyebrow">{t("lobby.roomCode")}</span>
          <span className="led big">{lobby.code}</span>
        </div>
        <ShareLink />
        <span className="online-count">
          <span className="dot on" /> {t("lobby.online", { count: lobby.onlineCount })}
        </span>
        <LanguageSwitch />
      </header>

      {!seated && (
        <label className="field nickname">
          <span>{t("lobby.yourNickname")}</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={20}
            placeholder={t("lobby.nicknamePlaceholder")}
          />
        </label>
      )}

      <ul className="seats">
        {lobby.seats.map((seat) => (
          <SeatCard
            key={seat.role}
            seat={seat}
            seated={seated}
            canClaim={nickname.trim().length > 0}
            onClaim={() => void run(claimSeat({ ...room, name: nickname, role: seat.role }))}
            onLeave={() => void run(leaveSeat(room))}
            onReady={(ready) => void run(setReady({ ...room, ready }))}
          />
        ))}
      </ul>

      <footer className="lobby-footer">
        {lobby.isHost && (
          <button
            type="button"
            className="button primary"
            disabled={!allReady}
            onClick={() => void run(startMatch(room))}
          >
            {t("lobby.startMatch")}
          </button>
        )}
        <p className="muted">
          {allReady
            ? lobby.isHost
              ? t("lobby.everyoneReady")
              : t("lobby.waitingForHost")
            : t("lobby.waitingFor", {
                names: new Intl.ListFormat(intlLocale(language), { type: "conjunction" }).format(waitingFor),
              })}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </footer>
    </main>
  )
}

type SeatCardProps = {
  readonly seat: Seat
  readonly seated: boolean
  readonly canClaim: boolean
  readonly onClaim: () => void
  readonly onLeave: () => void
  readonly onReady: (ready: boolean) => void
}

function SeatCard({ seat, seated, canClaim, onClaim, onLeave, onReady }: SeatCardProps) {
  const { t } = useTranslation()
  const { player } = seat
  return (
    <li className={`seat ${seat.role}${player?.isYou ? " mine" : ""}${player && !player.online ? " offline" : ""}`}>
      <span className="eyebrow">{t(`roles.${seat.role}.title`)}</span>
      <p className="blurb">{t(`roles.${seat.role}.blurb`)}</p>
      {player ? (
        <>
          <p className="player">
            <span className={`dot ${player.online ? "on" : "off"}`} title={t(player.online ? "lobby.seat.online" : "lobby.seat.offline")} />
            <bdi>{player.name}</bdi>
            {player.isYou && <span className="tag">{t("lobby.seat.you")}</span>}
            {player.isHost && <span className="tag">{t("lobby.seat.host")}</span>}
          </p>
          <p className={`status ${player.ready ? "ready" : ""}`}>
            {t(player.online ? (player.ready ? "lobby.seat.ready" : "lobby.seat.notReady") : "lobby.seat.offline")}
          </p>
          <div className="actions">
            {player.isYou ? (
              <>
                <button
                  type="button"
                  className={player.ready ? "button" : "button primary"}
                  aria-pressed={player.ready}
                  onClick={() => onReady(!player.ready)}
                >
                  {t(player.ready ? "lobby.seat.cancelReady" : "lobby.seat.setReady")}
                </button>
                <button type="button" className="button" onClick={onLeave}>
                  {t("lobby.seat.leave")}
                </button>
              </>
            ) : (
              !player.online && (
                <button type="button" className="button" disabled={!canClaim} onClick={onClaim}>
                  {t("lobby.seat.takeOver")}
                </button>
              )
            )}
          </div>
        </>
      ) : (
        <>
          <p className="player empty">{t("lobby.seat.open")}</p>
          <div className="actions">
            <button type="button" className="button" disabled={!canClaim} onClick={onClaim}>
              {t(seated ? "lobby.seat.switchHere" : "lobby.seat.claim")}
            </button>
          </div>
        </>
      )}
    </li>
  )
}

function ShareLink() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle")
  const show = (next: typeof status) => {
    setStatus(next)
    setTimeout(() => setStatus("idle"), 2000)
  }
  const copy = () =>
    void navigator.clipboard.writeText(window.location.href).then(
      () => show("copied"),
      () => show("failed"),
    )
  return (
    <button type="button" className="button share" onClick={copy} aria-live="polite">
      {t(`lobby.share.${status}`)}
    </button>
  )
}
