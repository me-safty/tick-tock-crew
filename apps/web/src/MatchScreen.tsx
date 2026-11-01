import { api } from "@tick-tock-crew/backend/api"
import { MAX_STRIKES } from "@tick-tock-crew/rules"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { lazy, Suspense, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { formatClock, secondsLeft, URGENT_SECONDS } from "./clock"
import { useMutationError } from "./errors"
import { sessionId } from "./guest"
import { intlLocale, useLanguage } from "./i18n"
import { LanguageSwitch } from "./i18n/LanguageSwitch"
import type { Lobby, Match, RoleView, ViewOf, WireRef } from "./roles"
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
  const { t } = useTranslation()
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
      <Suspense fallback={<p className="scene-loading muted">{t("match.settingUp")}</p>}>
        <Scene
          match={match}
          finale={finale}
          pendingCut={operator.pending}
          onCut={(ref) => void operator.cut(ref)}
          onOpenManual={() => setManualOpen(true)}
        />
      </Suspense>
      {role === "scanner" && <div className="xray-lens" data-label={t("match.xray")} aria-hidden />}
      <header className="hud">
        <div className="hud-role">
          <span className="eyebrow">{t("match.room", { code })}</span>
          <h1>{t(match.view ? `roles.${match.view.role}.title` : "roles.spectator")}</h1>
          {match.view?.role === "analyst" && <Defused view={match.view} />}
        </div>
        <div className="hud-end">
          {!ended && (
            <div className="hud-clock">
              <Countdown endsAt={match.endsAt} />
              <Strikes strikes={match.strikes} />
            </div>
          )}
          <LanguageSwitch />
        </div>
      </header>
      {!ended && (
        <footer className="hud-hint">
          {operator.feedback && (
            <p className={`feedback ${operator.feedback}`} role="status">
              {t(`match.feedback.${operator.feedback}`)}
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

function useCutWire(code: string) {
  const cutWire = useMutation(api.match.cutWire)
  const { error, run } = useMutationError()
  const [feedback, setFeedback] = useState<FunctionReturnType<typeof api.match.cutWire> | null>(null)
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
  const { t } = useTranslation()
  if (!view) return <p className="hint">{t("match.hint.noSeat")}</p>
  switch (view.role) {
    case "operator":
      return <p className="hint">{t("match.hint.operator")}</p>
    case "scanner":
      return <p className="hint">{t("match.hint.scanner")}</p>
    case "analyst":
      return manualOpen ? (
        <p className="hint">{t("match.hint.analyst")}</p>
      ) : (
        <button type="button" className="button primary" onClick={onOpenManual}>
          {t("match.hint.openManual")}
        </button>
      )
    default: {
      const _exhaustive: never = view
      return _exhaustive
    }
  }
}

function Defused({ view }: { readonly view: ViewOf<"analyst"> }) {
  const { t } = useTranslation()
  const defused = view.modules.filter((module) => module.solved).length
  return <p className="muted">{t("match.defused", { defused, total: view.modules.length })}</p>
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
  const { t } = useTranslation()
  const seconds = secondsLeft(endsAt, useNow(250))
  const clock = formatClock(seconds)
  return (
    <span className={`led big${seconds <= URGENT_SECONDS ? " urgent" : ""}`} role="timer" aria-label={t("match.timeLeft", { clock })}>
      {clock}
    </span>
  )
}

function Strikes({ strikes }: { readonly strikes: number }) {
  const { t } = useTranslation()
  return (
    // The key replays the newest strike's animation for every role when the count changes.
    <span key={strikes} className="strikes" role="img" aria-label={t("match.strikesLabel", { strikes, max: MAX_STRIKES })}>
      <span className="eyebrow">{t("match.strikes")}</span>
      {Array.from({ length: MAX_STRIKES }, (_, i) => (
        <span key={i} className={`strike${i < strikes ? " on" : ""}${i === strikes - 1 ? " latest" : ""}`}>
          ✕
        </span>
      ))}
    </span>
  )
}

type Manual = ViewOf<"analyst">["manual"]
type ManualCell = Extract<Manual[number]["blocks"][number], { kind: "table" }>["rows"][number][number]

function ManualSheet({ manual, onClose }: { readonly manual: Manual; readonly onClose: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [onClose])
  return (
    <aside className="manual-sheet" aria-label={t("match.manual.title")}>
      <header className="manual-sheet-header">
        <div>
          <span className="eyebrow" lang="en">
            Tick Tock Crew
          </span>
          <h2>{t("match.manual.title")}</h2>
        </div>
        <button type="button" className="button" onClick={onClose}>
          {t("match.manual.close")}
        </button>
      </header>
      {manual.map((section) => (
        <section key={section.title} className="module manual">
          <h3 className="module-title">{t(`manual.${section.title}`)}</h3>
          {section.blocks.map((block, i) =>
            block.kind === "text" ? (
              <p key={i}>{t(`manual.${block.text}`)}</p>
            ) : (
              <table key={i}>
                <thead>
                  <tr>
                    {block.columns.map((column) => (
                      <th key={column}>{t(`manual.${column}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, j) => (
                        <td key={j}>
                          <CellText cell={cell} />
                        </td>
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

function CellText({ cell }: { readonly cell: ManualCell }) {
  const { t } = useTranslation()
  const language = useLanguage()
  switch (cell.kind) {
    case "digits":
      return new Intl.ListFormat(intlLocale(language), { type: "disjunction" }).format(cell.digits.map(String))
    case "color":
      return t(`colors.${cell.color}`)
    default: {
      const _exhaustive: never = cell
      return _exhaustive
    }
  }
}

function MatchOver({ match }: { readonly match: Match }) {
  const { t } = useTranslation()
  const won = match.status === "won"
  const title = match.view ? (won ? "youWon" : "youLost") : won ? "crewWon" : "crewLost"
  const reason = won ? "wonReason" : match.strikes >= MAX_STRIKES ? "strikesReason" : "timeReason"
  return (
    <main className="screen match-over-screen">
      <section className={`panel match-over ${won ? "won" : "lost"}`}>
        <span className="eyebrow">{t(won ? "match.over.wonEyebrow" : "match.over.lostEyebrow")}</span>
        <h1>{t(`match.over.${title}`)}</h1>
        <p>{t(`match.over.${reason}`)}</p>
        <p className="muted">{t("match.over.strikesSummary", { strikes: match.strikes, max: MAX_STRIKES })}</p>
        <button type="button" className="button primary" onClick={() => navigate("/")}>
          {t("common.backHome")}
        </button>
      </section>
    </main>
  )
}
