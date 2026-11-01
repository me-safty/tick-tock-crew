import { api } from "@tick-tock-crew/backend/api"
import { DIAL_RANGE, MAX_STRIKES } from "@tick-tock-crew/rules"
import { useMutation, useQuery } from "convex/react"
import { lazy, type RefObject, Suspense, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { formatClock, secondsLeft, URGENT_SECONDS } from "./clock"
import { useMutationError } from "./errors"
import { sessionId } from "./guest"
import { LanguageSwitch } from "./i18n/LanguageSwitch"
import { ManualSheet } from "./ManualSheet"
import type { Lobby, Match, OperatorAction, RoleView, ViewOf } from "./roles"
import { navigate } from "./router"
import type { DialControl } from "./scene/Dial"

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
  const operator = useOperator(code)
  const dial = useDial()
  const ended = match.status !== "playing"
  useEffect(() => {
    if (!ended) return
    const id = setTimeout(() => setFinaleDone(true), FINALE_MS)
    return () => clearTimeout(id)
  }, [ended])
  const finale = ended && sawPlaying && !finaleDone
  const role = match.view?.role ?? "spectator"
  const dialModule = match.view?.role === "operator" ? match.view.modules.findIndex((module) => module.kind === "dial") : -1
  const dialArmed = dialModule >= 0 && match.view?.modules[dialModule]?.solved === false && !ended
  const sendFrequency = () => {
    if (operator.pending || !dialArmed) return
    void operator.act({ kind: "tune", module: dialModule, frequency: dial.control.frequency })
  }
  return (
    <div className={`match ${role}`}>
      <Suspense fallback={<p className="scene-loading muted">{t("match.settingUp")}</p>}>
        <Scene
          match={match}
          finale={finale}
          pending={operator.pending}
          onAct={(action) => void operator.act(action)}
          dial={dial.control}
          onOpenManual={() => setManualOpen(true)}
        />
      </Suspense>
      {dialArmed && <DialInput dial={dial} onSend={sendFrequency} />}
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
            <p className={`feedback ${operator.feedback.outcome}`} role="status">
              {t(`match.feedback.${operator.feedback.text}`)}
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

function useOperator(code: string) {
  const cutWire = useMutation(api.match.cutWire)
  const pressKey = useMutation(api.match.pressKey)
  const tuneDial = useMutation(api.match.tuneDial)
  const { error, run } = useMutationError()
  const [pending, setPending] = useState<OperatorAction | null>(null)
  const [feedback, setFeedback] = useState<Awaited<ReturnType<typeof send>> | null>(null)
  useEffect(() => {
    if (!feedback) return
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS)
    return () => clearTimeout(id)
  }, [feedback])

  async function send(action: OperatorAction) {
    switch (action.kind) {
      case "cut": {
        const outcome = await cutWire({ code, sessionId, module: action.module, wire: action.wire })
        return { outcome, text: `wires.${outcome}` } as const
      }
      case "press": {
        const outcome = await pressKey({ code, sessionId, module: action.module, key: action.key })
        return { outcome, text: `keypad.${outcome}` } as const
      }
      case "tune": {
        const outcome = await tuneDial({ code, sessionId, module: action.module, frequency: action.frequency })
        return { outcome, text: `dial.${outcome}` } as const
      }
      default: {
        const _exhaustive: never = action
        return _exhaustive
      }
    }
  }

  const act = async (action: OperatorAction) => {
    setPending(action)
    setFeedback(null)
    setFeedback(await run(send(action)))
    setPending(null)
  }
  return { pending, feedback, error, act }
}

function useDial() {
  const [frequency, setFrequency] = useState<number>(DIAL_RANGE.min)
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const control: DialControl = { frequency, focused, turn: setFrequency, focus: () => input.current?.focus({ preventScroll: true }) }
  return { control, input, setFocused }
}

/** The dial as a native slider for the keyboard and screen readers; the 3D knob mirrors it. */
function DialInput({
  dial: { control, input, setFocused },
  onSend,
}: {
  readonly dial: { control: DialControl; input: RefObject<HTMLInputElement | null>; setFocused: (focused: boolean) => void }
  readonly onSend: () => void
}) {
  const { t } = useTranslation()
  return (
    <input
      ref={input}
      className="sr-only"
      type="range"
      // The knob turns up to the right in both languages, so the arrow keys must too.
      dir="ltr"
      min={DIAL_RANGE.min}
      max={DIAL_RANGE.max}
      step={1}
      value={control.frequency}
      aria-label={t("match.dial.label")}
      aria-keyshortcuts="Enter"
      onChange={(event) => control.turn(event.currentTarget.valueAsNumber)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSend()
      }}
    />
  )
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
