import { api } from "@tick-tock-crew/backend/api"
import { useMutation } from "convex/react"
import { useEffect, useState } from "react"
import { useMutationError } from "./errors"
import { sessionId, useNickname } from "./guest"
import { preloadScene } from "./MatchScreen"
import { ROLE_INFO, type Lobby, type Seat } from "./roles"

export function LobbyScreen({ lobby }: { readonly lobby: Lobby }) {
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
    .map((seat) => seat.player?.name ?? `an open ${ROLE_INFO[seat.role].title} seat`)
  const allReady = waitingFor.length === 0

  return (
    <main className="screen lobby">
      <header className="lobby-header">
        <div>
          <span className="eyebrow">Room code</span>
          <span className="led big">{lobby.code}</span>
        </div>
        <ShareLink />
        <span className="online-count">
          <span className="dot on" /> {lobby.onlineCount} online
        </span>
      </header>

      {!seated && (
        <label className="field nickname">
          <span>Your nickname</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={20}
            placeholder="Pick one, then claim a seat"
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
            Start match
          </button>
        )}
        <p className="muted">
          {allReady
            ? lobby.isHost
              ? "Everyone is ready."
              : "Everyone is ready. Waiting for the host to start."
            : `Waiting for ${waitingFor.join(", ")}.`}
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
  const { title, blurb } = ROLE_INFO[seat.role]
  const { player } = seat
  return (
    <li className={`seat ${seat.role}${player?.isYou ? " mine" : ""}${player && !player.online ? " offline" : ""}`}>
      <span className="eyebrow">{title}</span>
      <p className="blurb">{blurb}</p>
      {player ? (
        <>
          <p className="player">
            <span className={`dot ${player.online ? "on" : "off"}`} title={player.online ? "Online" : "Offline"} />
            {player.name}
            {player.isYou && <span className="tag">you</span>}
            {player.isHost && <span className="tag">host</span>}
          </p>
          <p className={`status ${player.ready ? "ready" : ""}`}>
            {player.online ? (player.ready ? "Ready" : "Not ready") : "Offline"}
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
                  {player.ready ? "Cancel ready" : "Ready"}
                </button>
                <button type="button" className="button" onClick={onLeave}>
                  Leave seat
                </button>
              </>
            ) : (
              !player.online && (
                <button type="button" className="button" disabled={!canClaim} onClick={onClaim}>
                  Take over seat
                </button>
              )
            )}
          </div>
        </>
      ) : (
        <>
          <p className="player empty">Open seat</p>
          <div className="actions">
            <button type="button" className="button" disabled={!canClaim} onClick={onClaim}>
              {seated ? "Switch here" : "Claim seat"}
            </button>
          </div>
        </>
      )}
    </li>
  )
}

const SHARE_LABELS = { idle: "Copy invite link", copied: "Link copied", failed: "Copy failed, share the code" }

function ShareLink() {
  const [status, setStatus] = useState<keyof typeof SHARE_LABELS>("idle")
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
      {SHARE_LABELS[status]}
    </button>
  )
}
