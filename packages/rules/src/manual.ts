import { Schema } from "effect"
import { WaveShape } from "./dial"
import { Glyph } from "./keypad"
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
  "keypad.title",
  "keypad.intro",
  "keypad.step1",
  "keypad.ring",
  "keypad.positions",
  "keypad.step2",
  "keypad.step3",
  "keypad.strike",
  "dial.title",
  "dial.intro",
  "dial.step1",
  "dial.shape",
  "dial.withAE",
  "dial.withoutAE",
  "dial.step2",
  "dial.step3",
  "dial.strike",
] as const
const ManualText = Schema.Literals(MANUAL_TEXT)

const ManualCell = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("digits"), digits: MutableArray(Schema.Int) }),
  Schema.Struct({ kind: Schema.Literal("color"), color: Color }),
  Schema.Struct({ kind: Schema.Literal("number"), value: Schema.Int }),
  /** A ring of glyphs in position order, starting at position 1. */
  Schema.Struct({ kind: Schema.Literal("glyphs"), glyphs: MutableArray(Glyph) }),
  Schema.Struct({ kind: Schema.Literal("wave"), shape: WaveShape }),
])

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
