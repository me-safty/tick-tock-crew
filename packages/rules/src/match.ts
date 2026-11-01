import { Effect, Option, Schema } from "effect"
import type { Bomb, BombModule } from "./bomb"
import { DIAL_RANGE, solveDial } from "./dial"
import { solveKeypad } from "./keypad"
import { MutableArray } from "./manual"
import { burstAt, isHeld, pressureAt, sealsInBand, solveValve, type ValveEvent, ValveProgress } from "./valve"
import { solveWires } from "./wires"

export const MAX_STRIKES = 3

const solved = Schema.Boolean

export const ModuleState = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("wires"), solved, progress: Schema.Struct({ cut: MutableArray(Schema.Int) }) }),
  /** `pressed` holds the right presses so far, in order; wrong presses only add strikes. */
  Schema.Struct({ kind: Schema.Literal("keypad"), solved, progress: Schema.Struct({ pressed: MutableArray(Schema.Int) }) }),
  Schema.Struct({ kind: Schema.Literal("dial"), solved }),
  Schema.Struct({ kind: Schema.Literal("valve"), solved, progress: ValveProgress }),
])
export type ModuleState = typeof ModuleState.Type

export const MatchState = Schema.Struct({ strikes: Schema.Int, modules: Schema.Array(ModuleState) })
export type MatchState = typeof MatchState.Type

export const MatchStatus = Schema.Literals(["playing", "won", "lost"])
export type MatchStatus = typeof MatchStatus.Type

function initialModuleState({ kind }: BombModule, startedAt: number): ModuleState {
  switch (kind) {
    case "wires":
      return { kind, solved: false, progress: { cut: [] } }
    case "keypad":
      return { kind, solved: false, progress: { pressed: [] } }
    case "dial":
      return { kind, solved: false }
    case "valve":
      return { kind, solved: false, progress: { since: startedAt, events: [] } }
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

/** A fresh match; `startedAt` is the server time the valve starts building pressure. */
export function initialState(bomb: Bomb, { startedAt }: { readonly startedAt: number }): MatchState {
  return { strikes: 0, modules: bomb.modules.map((module) => initialModuleState(module, startedAt)) }
}

export function matchStatus(state: MatchState): MatchStatus {
  if (state.strikes >= MAX_STRIKES) return "lost"
  return state.modules.every((module) => module.solved) ? "won" : "playing"
}

export class MatchOver extends Schema.TaggedError<MatchOver>()("MatchOver", { status: MatchStatus }) {}
export class ModuleNotFound extends Schema.TaggedError<ModuleNotFound>()("ModuleNotFound", { module: Schema.Number }) {}
export class ModuleAlreadySolved extends Schema.TaggedError<ModuleAlreadySolved>()("ModuleAlreadySolved", {
  module: Schema.Number,
}) {}
export class WireNotFound extends Schema.TaggedError<WireNotFound>()("WireNotFound", { wire: Schema.Number }) {}
export class WireAlreadyCut extends Schema.TaggedError<WireAlreadyCut>()("WireAlreadyCut", { wire: Schema.Number }) {}
export class KeyNotFound extends Schema.TaggedError<KeyNotFound>()("KeyNotFound", { key: Schema.Number }) {}
export class KeyAlreadyPressed extends Schema.TaggedError<KeyAlreadyPressed>()("KeyAlreadyPressed", { key: Schema.Number }) {}
export class FrequencyOffDial extends Schema.TaggedError<FrequencyOffDial>()("FrequencyOffDial", {
  frequency: Schema.Number,
}) {}

export class ValveNotHeld extends Schema.TaggedError<ValveNotHeld>()("ValveNotHeld", {}) {}

type TargetError = MatchOver | ModuleNotFound | ModuleAlreadySolved
export type CutWireError = TargetError | WireNotFound | WireAlreadyCut
export type PressKeyError = TargetError | KeyNotFound | KeyAlreadyPressed
export type TuneDialError = TargetError | FrequencyOffDial
export type ReleaseValveError = TargetError | ValveNotHeld
export type ActionError = CutWireError | PressKeyError | TuneDialError | ReleaseValveError

export type Outcome<Kind extends string> = { readonly kind: Kind; readonly state: MatchState }

/** The module an action targets, while the match is on and the module is still armed. */
const target = (bomb: Bomb, state: MatchState, module: number) =>
  Effect.gen(function* () {
    const status = matchStatus(state)
    if (status !== "playing") return yield* new MatchOver({ status })
    const bombModule: BombModule | undefined = bomb.modules[module]
    const moduleState = state.modules[module]
    if (!bombModule || !moduleState) return yield* new ModuleNotFound({ module })
    if (moduleState.solved) return yield* new ModuleAlreadySolved({ module })
    return { bombModule, moduleState }
  })

/** Puts `next` in place of the module, adding a strike unless the action was right. */
function settle(state: MatchState, { module, next, right }: { module: number; next: ModuleState; right: boolean }) {
  return {
    strikes: right ? state.strikes : state.strikes + 1,
    modules: state.modules.map((current, index) => (index === module ? next : current)),
  }
}

export const cutWire = (
  bomb: Bomb,
  state: MatchState,
  { module, wire }: { readonly module: number; readonly wire: number },
): Effect.Effect<Outcome<"solved" | "strike">, CutWireError> =>
  Effect.gen(function* () {
    const { bombModule, moduleState } = yield* target(bomb, state, module)
    if (bombModule.kind !== "wires" || moduleState.kind !== "wires") return yield* new ModuleNotFound({ module })
    if (!bombModule.wires[wire]) return yield* new WireNotFound({ wire })
    if (moduleState.progress.cut.includes(wire)) return yield* new WireAlreadyCut({ wire })

    const right = Option.contains(solveWires(bomb.edgework.serial, bombModule.wires), wire)
    const next = { ...moduleState, solved: right, progress: { cut: [...moduleState.progress.cut, wire] } }
    return { kind: right ? "solved" : "strike", state: settle(state, { module, next, right }) }
  })

export const pressKey = (
  bomb: Bomb,
  state: MatchState,
  { module, key }: { readonly module: number; readonly key: number },
): Effect.Effect<Outcome<"solved" | "accepted" | "strike">, PressKeyError> =>
  Effect.gen(function* () {
    const { bombModule, moduleState } = yield* target(bomb, state, module)
    if (bombModule.kind !== "keypad" || moduleState.kind !== "keypad") return yield* new ModuleNotFound({ module })
    if (!bombModule.keys[key]) return yield* new KeyNotFound({ key })
    const { pressed } = moduleState.progress
    if (pressed.includes(key)) return yield* new KeyAlreadyPressed({ key })

    const order = Option.getOrElse(solveKeypad(bomb.edgework.serial, bombModule.keys), () => [])
    if (order[pressed.length] !== key) {
      return { kind: "strike", state: settle(state, { module, next: moduleState, right: false }) }
    }
    const done = pressed.length + 1 === order.length
    const next = { ...moduleState, solved: done, progress: { pressed: [...pressed, key] } }
    return { kind: done ? "solved" : "accepted", state: settle(state, { module, next, right: true }) }
  })

export const tuneDial = (
  bomb: Bomb,
  state: MatchState,
  { module, frequency }: { readonly module: number; readonly frequency: number },
): Effect.Effect<Outcome<"solved" | "strike">, TuneDialError> =>
  Effect.gen(function* () {
    const { bombModule, moduleState } = yield* target(bomb, state, module)
    if (bombModule.kind !== "dial" || moduleState.kind !== "dial") return yield* new ModuleNotFound({ module })
    if (!Number.isInteger(frequency) || frequency < DIAL_RANGE.min || frequency > DIAL_RANGE.max) {
      return yield* new FrequencyOffDial({ frequency })
    }

    const right = frequency === solveDial(bomb.edgework.serial, bombModule.waveform)
    return { kind: right ? "solved" : "strike", state: settle(state, { module, next: { ...moduleState, solved: right }, right }) }
  })

type ValveAction = { readonly module: number; readonly at: number }

/** The valve an action targets, with its events stamped no earlier than the last one, so the history stays in order. */
const targetValve = (bomb: Bomb, state: MatchState, { module, at }: ValveAction) =>
  Effect.gen(function* () {
    const { bombModule, moduleState } = yield* target(bomb, state, module)
    if (bombModule.kind !== "valve" || moduleState.kind !== "valve") return yield* new ModuleNotFound({ module })
    const { since, events } = moduleState.progress
    const stamp = Math.max(at, since, events.at(-1)?.at ?? since)
    const record = (...kinds: ReadonlyArray<ValveEvent["kind"]>) => ({
      since,
      events: [...events, ...kinds.map((kind) => ({ kind, at: stamp }))],
    })
    return { valve: bombModule, moduleState, stamp, record }
  })

/**
 * Starts venting. Holding a valve that is already held changes nothing. A valve that topped out before the hold
 * arrived bursts first, even if its scheduled burst hasn't run yet.
 */
export const holdValve = (
  bomb: Bomb,
  state: MatchState,
  action: ValveAction,
): Effect.Effect<Outcome<"held" | "burst">, TargetError> =>
  Effect.gen(function* () {
    const { valve, moduleState, stamp, record } = yield* targetValve(bomb, state, action)
    if (isHeld(valve.gauge, moduleState.progress)) return { kind: "held", state }
    const due = burstAt(valve.gauge, moduleState.progress)
    const burst = due !== null && due <= stamp
    const next = { ...moduleState, progress: burst ? record("reset", "hold") : record("hold") }
    return { kind: burst ? "burst" : "held", state: settle(state, { module: action.module, next, right: !burst }) }
  })

/** Seals the valve and judges the pressure at that moment. A strike puts the needle back at its start. */
export const releaseValve = (
  bomb: Bomb,
  state: MatchState,
  action: ValveAction,
): Effect.Effect<Outcome<"solved" | "strike">, ReleaseValveError> =>
  Effect.gen(function* () {
    const { valve, moduleState, stamp, record } = yield* targetValve(bomb, state, action)
    if (!isHeld(valve.gauge, moduleState.progress)) return yield* new ValveNotHeld()
    const pressure = pressureAt(valve.gauge, moduleState.progress, stamp)
    const right = sealsInBand({ band: solveValve(valve), pressure, vent: valve.gauge.vent })
    const next = { ...moduleState, solved: right, progress: right ? record("release") : record("release", "reset") }
    return { kind: right ? "solved" : "strike", state: settle(state, { module: action.module, next, right }) }
  })

/** Bursts the valve if its needle has reached the top by `at`: a strike, and the needle goes back to its start. */
export const burstValve = (
  bomb: Bomb,
  state: MatchState,
  action: ValveAction,
): Effect.Effect<Outcome<"burst" | "steady">, TargetError> =>
  Effect.gen(function* () {
    const { valve, moduleState, stamp, record } = yield* targetValve(bomb, state, action)
    const due = burstAt(valve.gauge, moduleState.progress)
    if (due === null || due > stamp) return { kind: "steady", state }
    const next = { ...moduleState, progress: record("reset") }
    return { kind: "burst", state: settle(state, { module: action.module, next, right: false }) }
  })
