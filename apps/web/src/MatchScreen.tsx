import { api } from "@tick-tock-crew/backend/api"
import { MAX_STRIKES } from "@tick-tock-crew/rules"
import { useMutation, useQuery } from "convex/react"
import { lazy, Suspense, useEffect, useState } from "react"
import { formatClock, secondsLeft, URGENT_SECONDS } from "./clock"
import { useMutationError } from "./errors"
import { sessionId } from "./guest"
import { type Lobby, type Match, ROLE_INFO, type RoleView, type ViewOf, type WireRef } from "./roles"
import { navigate } from "./router"

/** Starts downloading the 3D scene, so the lobby can fetch it before the match begins. */
export const preloadScene = () => import("./scene/Scene")

const Scene = lazy(() => preloadScene().then((module) => ({ default: module.Scene })))

/** How long the explosion or the relief plays before the end screen. */
const FINALE_MS = 2600

export function MatchScreen({ lobby }: { readonly lobby: Lobby }) {
  const match = useQuery(api.match.view, { code: lobby.code, sessionId })
  if (!match) return null
  return <MatchInPlay code={lobby.code} match={match} />
}

function MatchInPlay({ code, match }: { readonly code: string; readonly match: Match }) {
  // A room that was already over when it opened skips straight to the end screen.
  const [sawPlaying] = useState(match.status === "playing")
  const [finaleDone, setFinaleDone] = useState(false)
  const [manualOpen, setManualOpen] = useState(true)
  const operator = useCutWire(code)
  const ended = match.status !== "playing"
  useEffect(() => {
    if (!ended) return
    const id = setTimeout(() => setFinaleDone(true), FINALE_MS)
    return () => clearTimeout(id)
  }, [ended])
  const finale = ended && sawPlaying && !finaleDone
  const role = match.view?.role ?? "spectator"
  return (
    <div className={`match ${role}`}>
      <Suspense fallback={<p className="scene-loading muted">Setting up the room…</p>}>
        <Scene
          match={match}
          finale={finale}
          pendingCut={operator.pending}
          onCut={(ref) => void operator.cut(ref)}
          onOpenManual={() => setManualOpen(true)}
        />
      </Suspense>
      {role === "scanner" && <div className="xray-lens" aria-hidden />}
      <header className="hud">
        <div className="hud-role">
          <span className="eyebrow">Room {code}</span>
          <h1>{match.view ? ROLE_INFO[match.view.role].title : "Spectator"}</h1>
          {match.view?.role === "analyst" && <Defused view={match.view} />}
        </div>
        {!ended && (
          <div className="hud-clock">
            <Countdown endsAt={match.endsAt} />
            <Strikes strikes={match.strikes} />
          </div>
        )}
      </header>
      {!ended && (
        <footer className="hud-hint">
          {operator.feedback && (
            <p className={`feedback ${operator.feedback}`} role="status">
              {CUT_FEEDBACK[operator.feedback]}
            </p>
          )}
          {operator.error && (
            <p className="error" role="alert">
              {operator.error}
            </p>
          )}
          <Hint view={match.view} manualOpen={manualOpen} onOpenManual={() => setManualOpen(true)} />
        </footer>
      )}
      {match.view?.role === "analyst" && manualOpen && !ended && (
        <ManualSheet manual={match.view.manual} onClose={() => setManualOpen(false)} />
      )}
      {finale && <div className={`finale-flash ${match.status}`} aria-hidden />}
      {ended && !finale && <MatchOver match={match} />}
    </div>
  )
}

const FEEDBACK_MS = 4000
const CUT_FEEDBACK = { solved: "Clean cut. Module defused.", strike: "Wrong wire. Strike!" } as const

function useCutWire(code: string) {
  const cutWire = useMutation(api.match.cutWire)
  const { error, run } = useMutationError()
  const [feedback, setFeedback] = useState<keyof typeof CUT_FEEDBACK | null>(null)
  const [pending, setPending] = useState<WireRef | null>(null)
  useEffect(() => {
    if (!feedback) return
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS)
    return () => clearTimeout(id)
  }, [feedback])
  const cut = async (ref: WireRef) => {
    setPending(ref)
    setFeedback(null)
    setFeedback(await run(cutWire({ code, sessionId, ...ref })))
    setPending(null)
  }
  return { pending, feedback, error, cut }
}

function Hint({
  view,
  manualOpen,
  onOpenManual,
}: {
  readonly view: RoleView | null
  readonly manualOpen: boolean
  readonly onOpenManual: () => void
}) {
  if (!view) return <p className="hint">You don't hold a seat in this match.</p>
  switch (view.role) {
    case "operator":
      return <p className="hint">Drag to look around · Click a wire to cut it</p>
    case "scanner":
      return <p className="hint">Drag to look around · Read each wire's tag to your crew</p>
    case "analyst":
      return manualOpen ? (
        <p className="hint">Drag to look around</p>
      ) : (
        <button type="button" className="button primary" onClick={onOpenManual}>
          Open the manual
        </button>
      )
    default: {
      const _exhaustive: never = view
      return _exhaustive
    }
  }
}

function Defused({ view }: { readonly view: ViewOf<"analyst"> }) {
  const defused = view.modules.filter((module) => module.solved).length
  return (
    <p className="muted">
      Modules defused: {defused} of {view.modules.length}
    </p>
  )
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function Countdown({ endsAt }: { readonly endsAt: number }) {
  const seconds = secondsLeft(endsAt, useNow(250))
  const clock = formatClock(seconds)
  return (
    <span className={`led big${seconds <= URGENT_SECONDS ? " urgent" : ""}`} role="timer" aria-label={`${clock} left`}>
      {clock}
    </span>
  )
}

function Strikes({ strikes }: { readonly strikes: number }) {
  return (
    // The key replays the newest strike's animation for every role when the count changes.
    <span key={strikes} className="strikes" role="img" aria-label={`${strikes} of ${MAX_STRIKES} strikes`}>
      <span className="eyebrow">Strikes</span>
      {Array.from({ length: MAX_STRIKES }, (_, i) => (
        <span key={i} className={`strike${i < strikes ? " on" : ""}${i === strikes - 1 ? " latest" : ""}`}>
          ✕
        </span>
      ))}
    </span>
  )
}

function ManualSheet({ manual, onClose }: { readonly manual: ViewOf<"analyst">["manual"]; readonly onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [onClose])
  return (
    <aside className="manual-sheet" aria-label="Field manual">
      <header className="manual-sheet-header">
        <div>
          <span className="eyebrow">Tick Tock Crew</span>
          <h2>Field manual</h2>
        </div>
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </header>
      {manual.map((section) => (
        <section key={section.title} className="module manual">
          <h3 className="module-title">{section.title}</h3>
          {section.blocks.map((block, i) =>
            block.kind === "text" ? (
              <p key={i}>{block.text}</p>
            ) : (
              <table key={i}>
                <thead>
                  <tr>
                    {block.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row) => (
                    <tr key={row.join()}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ),
          )}
        </section>
      ))}
    </aside>
  )
}

function MatchOver({ match }: { readonly match: Match }) {
  const won = match.status === "won"
  const who = match.view ? "You" : "The crew"
  const reason = won
    ? "Every module is defused. Nice work, crew."
    : match.strikes >= MAX_STRIKES
      ? "Three strikes. The bomb went off."
      : "The timer ran out. The bomb went off."
  return (
    <main className="screen match-over-screen">
      <section className={`panel match-over ${won ? "won" : "lost"}`}>
        <span className="eyebrow">{won ? "Bomb defused" : "Boom"}</span>
        <h1>
          {who} {won ? "won" : "lost"}
        </h1>
        <p>{reason}</p>
        <p className="muted">
          Strikes: {match.strikes} of {MAX_STRIKES}
        </p>
        <button type="button" className="button primary" onClick={() => navigate("/")}>
          Back to home
        </button>
      </section>
    </main>
  )
}
