import { lazy, Suspense } from "react"
import { ROLE_INFO, type Lobby } from "./roles"

const Scene = lazy(() => import("./Scene").then((module) => ({ default: module.Scene })))

export function MatchStarted({ lobby }: { readonly lobby: Lobby }) {
  const mySeat = lobby.seats.find((seat) => seat.player?.isYou)
  return (
    <div className="match">
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <section className="panel match-card">
        <span className="eyebrow">Room {lobby.code}</span>
        <h1>Match started</h1>
        <p>{mySeat ? `You are the ${ROLE_INFO[mySeat.role].title}.` : "You are watching this match."}</p>
        <ul className="crew">
          {lobby.seats.map((seat) => (
            <li key={seat.role}>
              <span className="eyebrow">{ROLE_INFO[seat.role].title}</span> {seat.player?.name ?? "—"}
            </li>
          ))}
        </ul>
        <p className="muted">Placeholder: the bomb and its modules arrive in Milestone 3.</p>
      </section>
    </div>
  )
}
