import { api } from "@tick-tock-crew/backend/api"
import { MAX_STRIKES } from "@tick-tock-crew/rules"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { lazy, Suspense, useEffect, useState } from "react"
import { useMutationError } from "./errors"
import { sessionId } from "./guest"
import { ROLE_INFO, type Lobby } from "./roles"
import { navigate } from "./router"

const Scene = lazy(() => import("./Scene").then((module) => ({ default: module.Scene })))

type Match = NonNullable<FunctionReturnType<typeof api.match.view>>
type RoleView = NonNullable<Match["view"]>
type ViewOf<R extends RoleView["role"]> = Extract<RoleView, { role: R }>

export function MatchScreen({ lobby }: { readonly lobby: Lobby }) {
  const match = useQuery(api.match.view, { code: lobby.code, sessionId })
  if (!match) return null
  if (match.status !== "playing") return <MatchOver match={match} />
  return (
    <div className="match">
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <section className="panel match-card">
        <header className="match-header">
          <div>
            <span className="eyebrow">Room {lobby.code}</span>
            <h1>{match.view ? ROLE_INFO[match.view.role].title : "Spectator"}</h1>
          </div>
          <Countdown endsAt={match.endsAt} />
          <Strikes strikes={match.strikes} />
        </header>
        {match.view ? <RolePanel code={lobby.code} view={match.view} /> : <p className="muted">You don't hold a seat in this match.</p>}
      </section>
    </div>
  )
}

function RolePanel({ code, view }: { readonly code: string; readonly view: RoleView }) {
  switch (view.role) {
    case "operator":
      return <OperatorPanel code={code} view={view} />
    case "scanner":
      return <ScannerPanel view={view} />
    case "analyst":
      return <AnalystPanel view={view} />
    default: {
      const _exhaustive: never = view
      return _exhaustive
    }
  }
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
  const seconds = Math.max(0, Math.ceil((endsAt - useNow(250)) / 1000))
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
  return (
    <span className={`led big${seconds <= 30 ? " urgent" : ""}`} role="timer" aria-label={`${clock} left`}>
      {clock}
    </span>
  )
}

function Strikes({ strikes }: { readonly strikes: number }) {
  return (
    <span className="strikes" aria-label={`${strikes} of ${MAX_STRIKES} strikes`}>
      <span className="eyebrow">Strikes</span>
      {Array.from({ length: MAX_STRIKES }, (_, i) => (
        <span key={i} className={`strike${i < strikes ? " on" : ""}`}>
          ✕
        </span>
      ))}
    </span>
  )
}

function ModuleHeader({ title, solved }: { readonly title: string; readonly solved: boolean }) {
  return (
    <h2 className="module-title">
      {title}
      {solved && <span className="tag defused">defused</span>}
    </h2>
  )
}

const CUT_FEEDBACK = { solved: "Clean cut. Module defused.", strike: "Wrong wire. Strike!" } as const

function OperatorPanel({ code, view }: { readonly code: string; readonly view: ViewOf<"operator"> }) {
  const cutWire = useMutation(api.match.cutWire)
  const { error, run } = useMutationError()
  const [feedback, setFeedback] = useState<keyof typeof CUT_FEEDBACK | null>(null)
  const [cutting, setCutting] = useState(false)
  const cut = async (module: number, wire: number) => {
    setCutting(true)
    setFeedback(null)
    setFeedback(await run(cutWire({ code, sessionId, module, wire })))
    setCutting(false)
  }
  return (
    <>
      <p className="serial">
        <span className="eyebrow">Serial number</span>
        <span className="mono">{view.serial}</span>
      </p>
      {view.modules.map((module, moduleIndex) => (
        <section key={moduleIndex} className="module">
          <ModuleHeader title="Hidden wires" solved={module.solved} />
          <ol className="wires">
            {module.wires.map((wire, wireIndex) => (
              <li key={wireIndex} className={`wire${wire.cut ? " cut" : ""}`}>
                <span className="wire-number">{wireIndex + 1}</span>
                <span className={`insulation ${wire.color}`} />
                <span className="wire-label">{wire.color}</span>
                <button
                  type="button"
                  className="button"
                  disabled={wire.cut || module.solved || cutting}
                  onClick={() => void cut(moduleIndex, wireIndex)}
                >
                  {wire.cut ? "Cut" : `Cut wire ${wireIndex + 1}`}
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {feedback && (
        <p className={`feedback ${feedback}`} role="status">
          {CUT_FEEDBACK[feedback]}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

function ScannerPanel({ view }: { readonly view: ViewOf<"scanner"> }) {
  return (
    <>
      <p className="muted">X-ray: the tag under each wire's insulation, counted from the top.</p>
      {view.modules.map((module, moduleIndex) => (
        <section key={moduleIndex} className="module">
          <ModuleHeader title="Hidden wires" solved={module.solved} />
          <ol className="wires">
            {module.wires.map((wire, wireIndex) => (
              <li key={wireIndex} className={`wire${wire.cut ? " cut" : ""}`}>
                <span className="wire-number">{wireIndex + 1}</span>
                <span className="insulation xray" />
                <span className="mono tag-code">
                  {wire.tag.letter}
                  {wire.tag.digit}
                </span>
                {wire.cut && <span className="muted">cut</span>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  )
}

function AnalystPanel({ view }: { readonly view: ViewOf<"analyst"> }) {
  const defused = view.modules.filter((module) => module.solved).length
  return (
    <>
      <p className="muted">
        Modules defused: {defused} of {view.modules.length}
      </p>
      {view.manual.map((section) => (
        <section key={section.title} className="module manual">
          <h2 className="module-title">{section.title}</h2>
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
    </>
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
    <main className="screen">
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
