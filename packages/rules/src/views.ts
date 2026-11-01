import { Schema } from "effect"
import type { Bomb, BombModule, ModuleKind } from "./bomb"
import { DIAL_MANUAL, Waveform } from "./dial"
import { Glyph, KEYPAD_MANUAL } from "./keypad"
import { ManualSection, MutableArray } from "./manual"
import type { MatchState, ModuleState } from "./match"
import { Color, Tag, WIRES_MANUAL } from "./wires"

export const Role = Schema.Literals(["operator", "analyst", "scanner"])
export type Role = typeof Role.Type

const solved = Schema.Boolean
const cut = Schema.Boolean
const pressed = Schema.Boolean

const OperatorModule = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("wires"), solved, wires: MutableArray(Schema.Struct({ color: Color, cut })) }),
  Schema.Struct({ kind: Schema.Literal("keypad"), solved, keys: MutableArray(Schema.Struct({ glyph: Glyph, pressed })) }),
  Schema.Struct({ kind: Schema.Literal("dial"), solved }),
])
type OperatorModule = typeof OperatorModule.Type

export const OperatorView = Schema.Struct({
  role: Schema.Literal("operator"),
  serial: Schema.String,
  modules: MutableArray(OperatorModule),
})
export type OperatorView = typeof OperatorView.Type

const ScannerModule = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("wires"), solved, wires: MutableArray(Schema.Struct({ tag: Tag, cut })) }),
  Schema.Struct({
    kind: Schema.Literal("keypad"),
    solved,
    keys: MutableArray(Schema.Struct({ live: Schema.Boolean, pressed })),
  }),
  Schema.Struct({ kind: Schema.Literal("dial"), solved, waveform: Waveform }),
])
type ScannerModule = typeof ScannerModule.Type

export const ScannerView = Schema.Struct({ role: Schema.Literal("scanner"), modules: MutableArray(ScannerModule) })
export type ScannerView = typeof ScannerView.Type

export const AnalystView = Schema.Struct({
  role: Schema.Literal("analyst"),
  modules: MutableArray(Schema.Struct({ kind: Schema.Literals(["wires", "keypad", "dial"]), solved })),
  manual: MutableArray(ManualSection),
})
export type AnalystView = typeof AnalystView.Type

export const RoleView = Schema.Union([OperatorView, ScannerView, AnalystView])
export type RoleView = typeof RoleView.Type

const MANUAL: Record<ModuleKind, ManualSection> = { wires: WIRES_MANUAL, keypad: KEYPAD_MANUAL, dial: DIAL_MANUAL }

const cutWires = (state: ModuleState | undefined) => (state?.kind === "wires" ? state.progress.cut : [])
const pressedKeys = (state: ModuleState | undefined) => (state?.kind === "keypad" ? state.progress.pressed : [])

function operatorModule(module: BombModule, state: ModuleState | undefined): OperatorModule {
  const solved = state?.solved ?? false
  switch (module.kind) {
    case "wires": {
      const cut = cutWires(state)
      return { kind: module.kind, solved, wires: module.wires.map(({ color }, i) => ({ color, cut: cut.includes(i) })) }
    }
    case "keypad": {
      const pressed = pressedKeys(state)
      return { kind: module.kind, solved, keys: module.keys.map(({ glyph }, i) => ({ glyph, pressed: pressed.includes(i) })) }
    }
    case "dial":
      return { kind: module.kind, solved }
    default: {
      const _exhaustive: never = module
      return _exhaustive
    }
  }
}

function scannerModule(module: BombModule, state: ModuleState | undefined): ScannerModule {
  const solved = state?.solved ?? false
  switch (module.kind) {
    case "wires": {
      const cut = cutWires(state)
      return { kind: module.kind, solved, wires: module.wires.map(({ tag }, i) => ({ tag, cut: cut.includes(i) })) }
    }
    case "keypad": {
      const pressed = pressedKeys(state)
      return { kind: module.kind, solved, keys: module.keys.map(({ live }, i) => ({ live, pressed: pressed.includes(i) })) }
    }
    case "dial":
      return { kind: module.kind, solved, waveform: module.waveform }
    default: {
      const _exhaustive: never = module
      return _exhaustive
    }
  }
}

/** Only what `role` may know: the Operator sees the case, the Scanner the insides, the Analyst the manual. */
export function viewFor(bomb: Bomb, state: MatchState, role: Role): RoleView {
  const modules = bomb.modules.map((module, index) => ({ module, state: state.modules[index] }))
  switch (role) {
    case "operator":
      return {
        role,
        serial: bomb.edgework.serial,
        modules: modules.map(({ module, state }) => operatorModule(module, state)),
      }
    case "scanner":
      return { role, modules: modules.map(({ module, state }) => scannerModule(module, state)) }
    case "analyst":
      return {
        role,
        modules: modules.map(({ module, state }) => ({ kind: module.kind, solved: state?.solved ?? false })),
        manual: Object.values(MANUAL),
      }
    default: {
      const _exhaustive: never = role
      return _exhaustive
    }
  }
}
