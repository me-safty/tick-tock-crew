import { Effect, Option, Schema } from "effect"
import type { Bomb } from "./bomb"
import { solveWires } from "./wires"

export const MAX_STRIKES = 3

// M5 adds a state per new module kind; `progress` holds what that module needs to remember.
export const WiresState = Schema.Struct({
  kind: Schema.Literal("wires"),
  solved: Schema.Boolean,
  progress: Schema.Struct({ cut: Schema.Array(Schema.Int) }),
})
export const ModuleState = Schema.Union([WiresState])
export type ModuleState = typeof ModuleState.Type

export const MatchState = Schema.Struct({ strikes: Schema.Int, modules: Schema.Array(ModuleState) })
export type MatchState = typeof MatchState.Type

export const MatchStatus = Schema.Literals(["playing", "won", "lost"])
export type MatchStatus = typeof MatchStatus.Type

export function initialState(bomb: Bomb): MatchState {
  return { strikes: 0, modules: bomb.modules.map(({ kind }) => ({ kind, solved: false, progress: { cut: [] } })) }
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

export type CutWireError = MatchOver | ModuleNotFound | ModuleAlreadySolved | WireNotFound | WireAlreadyCut

export type CutWireOutcome = { readonly kind: "solved" | "strike"; readonly state: MatchState }

export const cutWire = (
  bomb: Bomb,
  state: MatchState,
  { module, wire }: { readonly module: number; readonly wire: number },
): Effect.Effect<CutWireOutcome, CutWireError> =>
  Effect.gen(function* () {
    const status = matchStatus(state)
    if (status !== "playing") return yield* new MatchOver({ status })
    const bombModule = bomb.modules[module]
    const moduleState = state.modules[module]
    if (!bombModule || !moduleState) return yield* new ModuleNotFound({ module })
    if (moduleState.solved) return yield* new ModuleAlreadySolved({ module })
    if (!bombModule.wires[wire]) return yield* new WireNotFound({ wire })
    if (moduleState.progress.cut.includes(wire)) return yield* new WireAlreadyCut({ wire })

    const solved = Option.contains(solveWires(bomb.edgework.serial, bombModule.wires), wire)
    const next: ModuleState = { ...moduleState, solved, progress: { cut: [...moduleState.progress.cut, wire] } }
    return {
      kind: solved ? "solved" : "strike",
      state: {
        strikes: solved ? state.strikes : state.strikes + 1,
        modules: state.modules.map((current, index) => (index === module ? next : current)),
      },
    }
  })
