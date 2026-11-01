import { Schema } from "effect"
import { Color } from "./wires"

// Views travel to clients as plain JSON, and Convex return validators type arrays as mutable.
export const MutableArray = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item))

/** Manual prose travels as keys; each client renders them in the player's language. */
export const MANUAL_TEXT = [
  "wires.title",
  "wires.intro",
  "wires.step1",
  "wires.serialEndsIn",
  "wires.keyColor",
  "wires.step2",
  "wires.step3",
  "wires.unique",
] as const
const ManualText = Schema.Literals(MANUAL_TEXT)

export const ManualCell = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("digits"), digits: MutableArray(Schema.Int) }),
  Schema.Struct({ kind: Schema.Literal("color"), color: Color }),
])
export type ManualCell = typeof ManualCell.Type

export const ManualBlock = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("text"), text: ManualText }),
  Schema.Struct({
    kind: Schema.Literal("table"),
    columns: MutableArray(ManualText),
    rows: MutableArray(MutableArray(ManualCell)),
  }),
])
export type ManualBlock = typeof ManualBlock.Type

export const ManualSection = Schema.Struct({ title: ManualText, blocks: MutableArray(ManualBlock) })
export type ManualSection = typeof ManualSection.Type
