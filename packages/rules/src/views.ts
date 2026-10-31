import { Schema } from "effect"
import type { Bomb, ModuleKind } from "./bomb"
import { ManualSection, MutableArray } from "./manual"
import type { MatchState } from "./match"
import { Color, Tag, WIRES_MANUAL } from "./wires"

export const Role = Schema.Literals(["operator", "analyst", "scanner"])
export type Role = typeof Role.Type

const moduleFields = { kind: Schema.Literal("wires"), solved: Schema.Boolean }
const cut = Schema.Boolean

export const OperatorView = Schema.Struct({
  role: Schema.Literal("operator"),
  serial: Schema.String,
  modules: MutableArray(Schema.Struct({ ...moduleFields, wires: MutableArray(Schema.Struct({ color: Color, cut })) })),
})
export type OperatorView = typeof OperatorView.Type

export const ScannerView = Schema.Struct({
  role: Schema.Literal("scanner"),
  modules: MutableArray(Schema.Struct({ ...moduleFields, wires: MutableArray(Schema.Struct({ tag: Tag, cut })) })),
})
export type ScannerView = typeof ScannerView.Type

export const AnalystView = Schema.Struct({
  role: Schema.Literal("analyst"),
  modules: MutableArray(Schema.Struct(moduleFields)),
  manual: MutableArray(ManualSection),
})
export type AnalystView = typeof AnalystView.Type

export const RoleView = Schema.Union([OperatorView, ScannerView, AnalystView])
export type RoleView = typeof RoleView.Type

const MANUAL: Record<ModuleKind, ManualSection> = { wires: WIRES_MANUAL }

/** Only what `role` may know: the Operator sees the case, the Scanner the insides, the Analyst the manual. */
export function viewFor(bomb: Bomb, state: MatchState, role: Role): RoleView {
  const modules = bomb.modules.map((module, index) => {
    const moduleState = state.modules[index]
    const cutWires = moduleState?.progress.cut ?? []
    return {
      kind: module.kind,
      solved: moduleState?.solved ?? false,
      wires: module.wires.map((wire, wireIndex) => ({ ...wire, cut: cutWires.includes(wireIndex) })),
    }
  })
  switch (role) {
    case "operator":
      return {
        role,
        serial: bomb.edgework.serial,
        modules: modules.map(({ wires, ...module }) => ({
          ...module,
          wires: wires.map(({ color, cut }) => ({ color, cut })),
        })),
      }
    case "scanner":
      return {
        role,
        modules: modules.map(({ wires, ...module }) => ({ ...module, wires: wires.map(({ tag, cut }) => ({ tag, cut })) })),
      }
    case "analyst":
      return { role, modules: modules.map(({ kind, solved }) => ({ kind, solved })), manual: Object.values(MANUAL) }
    default: {
      const _exhaustive: never = role
      return _exhaustive
    }
  }
}
