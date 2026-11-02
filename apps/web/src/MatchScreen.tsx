import { api } from "@tick-tock-crew/backend/api"
import { DIAL_RANGE, MAX_STRIKES } from "@tick-tock-crew/rules"
import { useMutation, useQuery } from "convex/react"
import { lazy, type RefObject, Suspense, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { clockTime, formatClock, secondsLeft, URGENT_SECONDS } from "./clock"
import { Callouts } from "./Callouts"
import { CrewBar } from "./CrewBar"
import { EmoteWheel } from "./EmoteWheel"
import { useMutationError } from "./errors"
import { sessionId } from "./guest"
import { LanguageSwitch } from "./i18n/LanguageSwitch"
import { ManualSheet, PinIcon } from "./ManualSheet"
import { PauseOverlay } from "./PauseOverlay"
import { bombPings, pingedSections, usePings } from "./pings"
import type { Lobby, Match, OperatorAction, RoleView, ViewOf } from "./roles"
import { navigate } from "./router"
import type { DialControl } from "./scene/Dial"
import type { HoldSource, ValveControl } from "./scene/Valve"
import { useServerClockOffset } from "./serverClock"

/** Starts downloading the 3D scene, so the lobby can fetch it before the match begins. */
export const preloadScene = () => import("./scene/Scene")

const Scene = lazy(() => preloadScene().then((module) => ({ default: module.Scene })))

/** How long the explosion or the relief plays before the end screen. */
const FINALE_MS = 2600

export function MatchScreen({ lobby }: { readonly lobby: Lobby }) {
  const match = useQuery(api.match.view, { code: lobby.code, sessionId })
  if (!match) return null
  return <MatchInPlay lobby={lobby} match={match} />
}

function MatchInPlay({ lobby, match }: { readonly lobby: Lobby; readonly match: Match }) {
  const { code } = lobby
  const { t } = useTranslation()
  const ended = match.status === "won" || match.status === "lost"
  const paused = match.status === "paused"
  // A room that was already over when it opened skips straight to the end screen.
  const [sawPlaying] = useState(!ended)
  const [finaleDone, setFinaleDone] = useState(false)
  const [manualOpen, setManualOpen] = useState(true)
  const operator = useOperator(code)
  const dial = useDial()
  useAbsenceReport({ lobby, playing: match.status === "playing" })
  useEffect(() => {
    if (!ended) return
    const id = setTimeout(() => setFinaleDone(true), FINALE_MS)
    return () => clearTimeout(id)
  }, [ended])
  const finale = ended && sawPlaying && !finaleDone
  const role = match.view?.role ?? "spectator"
  const dialModule = match.view?.role === "operator" ? match.view.modules.findIndex((module) => module.kind === "dial") : -1
  const dialArmed = dialModule >= 0 && match.view?.modules[dialModule]?.solved === false && !ended && !paused
  const valveModule = match.view?.role === "operator" ? match.view.modules.findIndex((module) => module.kind === "valve") : -1
  const [pinging, setPinging] = useState(false)
  const valve = useValve({
    armed: valveModule >= 0 && match.view?.modules[valveModule]?.solved === false && !ended && !paused && !pinging,
    paused,
    onHold: () => void operator.act({ kind: "hold", module: valveModule }),
    onRelease: () => void operator.act({ kind: "release", module: valveModule }),
  })
  const clockOffset = useServerClockOffset(role === "scanner")
  const pings = usePings(code)
  const canPingBomb = (role === "operator" || role === "scanner") && !ended
  useEffect(() => {
    if (!pinging) return
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setPinging(false)
    }
    window.addEventListener("keydown", cancel)
    return () => window.removeEventListener("keydown", cancel)
  }, [pinging])
  const sendFrequency = () => {
    if (operator.pending || !dialArmed) return
    void operator.act({ kind: "tune", module: dialModule, frequency: dial.control.frequency })
  }
  return (
    <div className={`match ${role}${pinging && canPingBomb ? " pinging" : ""}`}>
      <Suspense fallback={<p className="scene-loading muted">{t("match.settingUp")}</p>}>
        <Scene
          match={match}
          finale={finale}
          pending={operator.pending}
          onAct={(action) => void operator.act(action)}
          dial={dial.control}
          valve={valve.control}
          clockOffset={clockOffset}
          onOpenManual={() => setManualOpen(true)}
          pings={bombPings(pings.pings)}
          pinging={pinging && canPingBomb}
          onPing={(target) => {
            setPinging(false)
            pings.point(target)
          }}
        />
      </Suspense>
      {dialArmed && <DialInput dial={dial} onSend={sendFrequency} />}
      {valve.control.armed && <ValveInput valve={valve} />}
      {role === "scanner" && <div className="xray-lens" data-label={t("match.xray")} aria-hidden />}
      {/* Under the HUD, so the stopped clock stays in view. */}
      {paused && <PauseOverlay lobby={lobby} seated={match.view !== null} />}
      <header className="hud">
        <div className="hud-start">
          <div className="hud-role">
            <span className="eyebrow">{t("match.room", { code })}</span>
            <h1>{t(match.view ? `roles.${match.view.role}.title` : "roles.spectator")}</h1>
            {match.view?.role === "analyst" && <Defused view={match.view} />}
          </div>
          {match.view && !ended && (
            <CrewBar seats={lobby.seats}>
              {canPingBomb && (
                <button
                  type="button"
                  className={`button ping-toggle${pinging ? " on" : ""}`}
                  aria-pressed={pinging}
                  onClick={() => setPinging((current) => !current)}
                >
                  <PinIcon /> {t("ping.mode")}
                </button>
              )}
              <EmoteWheel onEmote={pings.emote} />
            </CrewBar>
          )}
        </div>
        <div className="hud-end">
          {!ended && (
            <div className="hud-clock">
              <Countdown match={match} />
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
          {(operator.error ?? pings.error) && (
            <p className="error" role="alert">
              {operator.error ?? pings.error}
            </p>
          )}
          {pinging && canPingBomb ? (
            <p className="hint">{t("ping.hint")}</p>
          ) : (
            <Hint view={match.view} manualOpen={manualOpen} onOpenManual={() => setManualOpen(true)} />
          )}
        </footer>
      )}
      {match.view?.role === "analyst" && manualOpen && !ended && (
        <ManualSheet
          manual={match.view.manual}
          pinged={pingedSections(pings.pings)}
          onPing={(section) => pings.point({ kind: "manual", section })}
          onClose={() => setManualOpen(false)}
        />
      )}
      {!ended && match.view && (
        <Callouts
          pings={pings.pings}
          me={match.view.role}
          seats={lobby.seats}
          modules={match.view.modules.map((module) => module.kind)}
        />
      )}
      {finale && <div className={`finale-flash ${match.status}`} aria-hidden />}
      {ended && !finale && <MatchOver code={code} match={match} />}
    </div>
  )
}

const FEEDBACK_MS = 4000

/**
 * Tells the server when a seat drops mid-match. The server checks presence itself and pauses only if the seat is
 * still empty after a grace period, so every viewer may report and a reload never pauses.
 */
function useAbsenceReport({ lobby, playing }: { readonly lobby: Lobby; readonly playing: boolean }) {
  const reportAbsence = useMutation(api.pause.reportAbsence)
  const absent = lobby.seats
    .filter((seat) => seat.player && !seat.player.online)
    .map((seat) => seat.role)
    .join()
  useEffect(() => {
    if (playing && absent) void reportAbsence({ code: lobby.code })
  }, [playing, absent, lobby.code, reportAbsence])
}

function useOperator(code: string) {
  const cutWire = useMutation(api.match.cutWire)
  const pressKey = useMutation(api.match.pressKey)
  const tuneDial = useMutation(api.match.tuneDial)
  const holdValve = useMutation(api.match.holdValve)
  const releaseValve = useMutation(api.match.releaseValve)
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
      case "hold": {
        const outcome = await holdValve({ code, sessionId, module: action.module })
        return outcome === "burst" ? ({ outcome: "strike", text: "valve.burst" } as const) : null
      }
      case "release": {
        const outcome = await releaseValve({ code, sessionId, module: action.module })
        return { outcome, text: `valve.${outcome}` } as const
      }
      default: {
        const _exhaustive: never = action
        return _exhaustive
      }
    }
  }

  const act = async (action: OperatorAction) => {
    // The valve answers in real time, so working it never locks the rest of the bomb.
    const locks = action.kind !== "hold" && action.kind !== "release"
    if (locks) setPending(action)
    // A hold right after a release must leave that release's result on screen.
    if (action.kind !== "hold") setFeedback(null)
    const result = await run(send(action))
    if (result) setFeedback(result)
    if (locks) setPending(null)
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

/** A press shorter than this is a tap: it selects the valve without venting, so it never costs a strike. */
const TAP_MS = 150

function useValve({
  armed,
  paused,
  onHold,
  onRelease,
}: {
  armed: boolean
  paused: boolean
  onHold: () => void
  onRelease: () => void
}) {
  const [held, setHeld] = useState(false)
  const [focused, setFocused] = useState(false)
  // Window listeners outlive the render that set them up, so they read the hold from refs.
  const holding = useRef<HoldSource | null>(null)
  const pendingHold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const latestHold = useRef(onHold)
  latestHold.current = onHold
  const press = (by: HoldSource) => {
    if (holding.current || !armed) return
    holding.current = by
    setHeld(true)
    pendingHold.current = setTimeout(() => {
      pendingHold.current = null
      latestHold.current()
    }, TAP_MS)
  }
  const letGo = () => {
    if (!holding.current) return
    holding.current = null
    setHeld(false)
    if (pendingHold.current) {
      clearTimeout(pendingHold.current)
      pendingHold.current = null
      return
    }
    onRelease()
  }
  // A click on the canvas takes focus off the button, which must not end a hold the pointer just started.
  const blurred = () => {
    setFocused(false)
    if (holding.current === "key") letGo()
  }
  const latestLetGo = useRef(letGo)
  latestLetGo.current = letGo
  // The server seals a held valve when the match pauses, so the hand comes off without a release to judge.
  useEffect(() => {
    if (!paused) return
    holding.current = null
    setHeld(false)
    if (pendingHold.current) clearTimeout(pendingHold.current)
    pendingHold.current = null
  }, [paused])
  useEffect(() => {
    // Without focus the page never sees the key or button come up, so a hold would be stuck venting.
    const away = () => {
      if (document.hidden || !document.hasFocus()) latestLetGo.current()
    }
    window.addEventListener("blur", away)
    document.addEventListener("visibilitychange", away)
    return () => {
      window.removeEventListener("blur", away)
      document.removeEventListener("visibilitychange", away)
      if (pendingHold.current) clearTimeout(pendingHold.current)
    }
  }, [])
  const control: ValveControl = {
    armed,
    held,
    focused,
    press,
    letGo,
    focus: () => button.current?.focus({ preventScroll: true }),
  }
  return { control, button, blurred, setFocused }
}

const HOLD_KEYS = new Set([" ", "Enter"])

/** The valve as a native button for the keyboard and screen readers: holding Space or Enter holds the valve. */
function ValveInput({
  valve: { control, button, setFocused, blurred },
}: {
  readonly valve: ReturnType<typeof useValve>
}) {
  const { t } = useTranslation()
  return (
    <button
      ref={button}
      type="button"
      className="sr-only"
      aria-label={t("match.valve.label")}
      aria-pressed={control.held}
      aria-keyshortcuts="Space Enter"
      onKeyDown={(event) => {
        if (!HOLD_KEYS.has(event.key)) return
        event.preventDefault()
        if (!event.repeat) control.press("key")
      }}
      onKeyUp={(event) => {
        if (!HOLD_KEYS.has(event.key)) return
        event.preventDefault()
        control.letGo()
      }}
      onFocus={() => setFocused(true)}
      onBlur={blurred}
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

function Countdown({ match }: { readonly match: Match }) {
  const { t } = useTranslation()
  const seconds = secondsLeft(match.endsAt, clockTime(match, useNow(250)))
  const clock = formatClock(seconds)
  return (
    <span className={`led big${seconds <= URGENT_SECONDS && match.status === "playing" ? " urgent" : ""}`} role="timer" aria-label={t("match.timeLeft", { clock })}>
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

function MatchOver({ code, match }: { readonly code: string; readonly match: Match }) {
  const { t } = useTranslation()
  const playAgain = useMutation(api.rooms.playAgain)
  const { error, run } = useMutationError()
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
        <div className="match-over-actions">
          {match.view && (
            <button type="button" className="button primary" onClick={() => void run(playAgain({ code, sessionId }))}>
              {t("match.over.playAgain")}
            </button>
          )}
          <button type="button" className={match.view ? "button" : "button primary"} onClick={() => navigate("/")}>
            {t("common.backHome")}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
