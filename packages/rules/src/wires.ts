import { Option, Schema } from "effect"
import type { ManualSection } from "./manual"
import type { Rng } from "./rng"

export const COLORS = ["red", "blue", "yellow", "white", "black", "green"] as const
export const Color = Schema.Literals(COLORS)
export type Color = typeof Color.Type

// Tags and serial numbers share these letters, so a tag letter often appears in the serial.
export const LETTERS = ["A", "C", "E", "H", "K", "M", "P", "R", "T", "X"] as const
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export const Tag = Schema.Struct({
  letter: Schema.Literals(LETTERS),
  digit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9 })),
})
export type Tag = typeof Tag.Type

export const Wire = Schema.Struct({ color: Color, tag: Tag })
export type Wire = typeof Wire.Type

export const WiresModule = Schema.Struct({ kind: Schema.Literal("wires"), wires: Schema.Array(Wire) })
export type WiresModule = typeof WiresModule.Type

const KEY_COLORS: ReadonlyArray<{ readonly digits: readonly [number, number]; readonly color: Color }> = [
  { digits: [0, 5], color: "red" },
  { digits: [1, 6], color: "blue" },
  { digits: [2, 7], color: "yellow" },
  { digits: [3, 8], color: "white" },
  { digits: [4, 9], color: "black" },
]

function keyColor(serial: string) {
  const lastDigit = Number(serial.slice(-1))
  return KEY_COLORS.find(({ digits }) => digits.includes(lastDigit))?.color
}

/** The index of the one wire to cut, per WIRES_MANUAL. */
export function solveWires(serial: string, wires: ReadonlyArray<Wire>): Option.Option<number> {
  const key = keyColor(serial)
  const indexed = wires.map((wire, index) => ({ ...wire, index }))
  const keyed = indexed.filter((wire) => wire.color === key)
  const candidates = keyed.length >= 2 ? keyed : indexed.filter((wire) => wire.color !== key)
  const matching = candidates.filter((wire) => serial.includes(wire.tag.letter))
  const [chosen] =
    matching.length > 0
      ? matching.sort((a, b) => b.tag.digit - a.tag.digit)
      : candidates.sort((a, b) => a.tag.digit - b.tag.digit)
  return Option.fromNullishOr(chosen?.index)
}

const WIRE_COUNTS = { easy: [3, 4], normal: [4, 5], hard: [5, 6] } as const

export function generateWires(
  rng: Rng,
  { serial, difficulty }: { readonly serial: string; readonly difficulty: keyof typeof WIRE_COUNTS },
): WiresModule {
  const [min, max] = WIRE_COUNTS[difficulty]
  const count = rng.int(min, max)
  // Without this, two wires rarely share the key color and step 2 would almost always take its second branch.
  const keyCount = rng.int(0, Math.min(3, count - 1))
  const key = keyColor(serial)
  const otherColor = (): Color => {
    const color = rng.pick(COLORS)
    return color === key ? otherColor() : color
  }
  const wires = rng
    .shuffle(DIGITS)
    .slice(0, count)
    .map((digit, i) => ({
      color: key && i < keyCount ? key : otherColor(),
      tag: { letter: rng.pick(LETTERS), digit },
    }))
  return { kind: "wires", wires: rng.shuffle(wires) }
}

export const WIRES_MANUAL: ManualSection = {
  title: "wires.title",
  blocks: [
    { kind: "text", text: "wires.intro" },
    { kind: "text", text: "wires.step1" },
    {
      kind: "table",
      columns: ["wires.serialEndsIn", "wires.keyColor"],
      rows: KEY_COLORS.map(({ digits, color }) => [
        { kind: "digits", digits: [...digits] },
        { kind: "color", color },
      ]),
    },
    { kind: "text", text: "wires.step2" },
    { kind: "text", text: "wires.step3" },
    { kind: "text", text: "wires.unique" },
  ],
}
