import { Effect, Option, Schema } from "effect"
import type { Bomb, BombModule } from "./bomb"
import { DIAL_RANGE, solveDial } from "./dial"
import { solveKeypad } from "./keypad"
import { MutableArray } from "./manual"
import { solveWires } from "./wires"

export const MAX_STRIKES = 3

const solved = Schema.Boolean

export const ModuleState = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("wires"), solved, progress: Schema.Struct({ cut: MutableArray(Schema.Int) }) }),
  /** `pressed` holds the right presses so far, in order; wrong presses only add strikes. */
  Schema.Struct({ kind: Schema.Literal("keypad"), solved, progress: Schema.Struct({ pressed: MutableArray(Schema.Int) }) }),
  Schema.Struct({ kind: Schema.Literal("dial"), solved }),
])
export type ModuleState = typeof ModuleState.Type

export const MatchState = Schema.Struct({ strikes: Schema.Int, modules: Schema.Array(ModuleState) })
export type MatchState = typeof MatchState.Type

export const MatchStatus = Schema.Literals(["playing", "won", "lost"])
export type MatchStatus = typeof MatchStatus.Type

function initialModuleState({ kind }: BombModule): ModuleState {
  switch (kind) {
    case "wires":
      return { kind, solved: false, progress: { cut: [] } }
    case "keypad":
      return { kind, solved: false, progress: { pressed: [] } }
    case "dial":
      return { kind, solved: false }
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

export function initialState(bomb: Bomb): MatchState {
  return { strikes: 0, modules: bomb.modules.map(initialModuleState) }
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

type TargetError = MatchOver | ModuleNotFound | ModuleAlreadySolved
export type CutWireError = TargetError | WireNotFound | WireAlreadyCut
export type PressKeyError = TargetError | KeyNotFound | KeyAlreadyPressed
export type TuneDialError = TargetError | FrequencyOffDial
export type ActionError = CutWireError | PressKeyError | TuneDialError

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
