import { Option, Schema } from "effect"
import type { ManualSection } from "./manual"
import type { Rng } from "./rng"

export const FRAMES = ["circle", "triangle", "square", "arch"] as const
export const MARKS = ["dot", "dash", "stem", "cross", "hook", "pair"] as const

/** A keypad symbol: an outer frame with a mark inside. Clients draw it; the rules only compare them. */
export const Glyph = Schema.Struct({ frame: Schema.Literals(FRAMES), mark: Schema.Literals(MARKS) })
export type Glyph = typeof Glyph.Type

type Ring = readonly [Glyph, ...Glyph[]]

const glyph = (frame: Glyph["frame"], mark: Glyph["mark"]): Glyph => ({ frame, mark })

/** Every glyph sits in exactly one ring. Walking a ring wraps from its last position back to the first. */
export const RINGS: readonly [Ring, Ring, Ring, Ring] = [
  [
    glyph("triangle", "cross"),
    glyph("circle", "dot"),
    glyph("arch", "pair"),
    glyph("square", "stem"),
    glyph("circle", "hook"),
    glyph("arch", "dash"),
  ],
  [
    glyph("square", "cross"),
    glyph("triangle", "hook"),
    glyph("circle", "dash"),
    glyph("arch", "stem"),
    glyph("circle", "pair"),
    glyph("triangle", "dot"),
  ],
  [
    glyph("circle", "stem"),
    glyph("square", "hook"),
    glyph("triangle", "pair"),
    glyph("arch", "cross"),
    glyph("square", "dot"),
    glyph("triangle", "dash"),
  ],
  [
    glyph("arch", "dot"),
    glyph("square", "pair"),
    glyph("circle", "cross"),
    glyph("triangle", "stem"),
    glyph("arch", "hook"),
    glyph("square", "dash"),
  ],
]

export const sameGlyph = (a: Glyph, b: Glyph) => a.frame === b.frame && a.mark === b.mark

export const Key = Schema.Struct({ glyph: Glyph, live: Schema.Boolean })
export type Key = typeof Key.Type

export const KeypadModule = Schema.Struct({ kind: Schema.Literal("keypad"), keys: Schema.Array(Key) })
export type KeypadModule = typeof KeypadModule.Type

const KEY_COUNT = 4

const ringPosition = (ring: Ring, target: Glyph) => ring.findIndex((item) => sameGlyph(item, target))

/** The keys to press, in order, per KEYPAD_MANUAL. */
export function solveKeypad(serial: string, keys: ReadonlyArray<Key>): Option.Option<ReadonlyArray<number>> {
  const ring = RINGS.find((candidate) => keys.filter((key) => ringPosition(candidate, key.glyph) >= 0).length >= 3)
  const live = keys.find((key) => key.live)
  if (!ring || !live) return Option.none()
  const start = ringPosition(ring, live.glyph)
  if (start < 0) return Option.none()
  const forward = Number(/\d/.exec(serial)?.[0]) % 2 === 0
  const stepsFromStart = (position: number) => {
    const ahead = (position - start + ring.length) % ring.length
    return forward ? ahead : (ring.length - ahead) % ring.length
  }
  return Option.some(
    keys
      .map((key, index) => ({ index, position: ringPosition(ring, key.glyph) }))
      .filter(({ position }) => position >= 0)
      .sort((a, b) => stepsFromStart(a.position) - stepsFromStart(b.position))
      .map(({ index }) => index),
  )
}

export function generateKeypad(rng: Rng, { difficulty }: { readonly difficulty: "easy" | "normal" | "hard" }): KeypadModule {
  const dud = difficulty === "hard" || (difficulty === "normal" && rng.int(0, 1) === 1)
  const [ring = RINGS[0], dudRing = RINGS[1]] = rng.shuffle(RINGS)
  const [live, ...others] = rng.shuffle(ring).slice(0, dud ? KEY_COUNT - 1 : KEY_COUNT)
  const keys = [
    ...(live ? [{ glyph: live, live: true }] : []),
    ...others.map((glyph) => ({ glyph, live: false })),
    ...(dud ? [{ glyph: rng.pick(dudRing), live: false }] : []),
  ]
  return { kind: "keypad", keys: rng.shuffle(keys) }
}

export const KEYPAD_MANUAL: ManualSection = {
  title: "keypad.title",
  blocks: [
    { kind: "text", text: "keypad.intro" },
    { kind: "text", text: "keypad.step1" },
    {
      kind: "table",
      columns: ["keypad.ring", "keypad.positions"],
      rows: RINGS.map((ring, index) => [
        { kind: "number", value: index + 1 },
        { kind: "glyphs", glyphs: [...ring] },
      ]),
    },
    { kind: "text", text: "keypad.step2" },
    { kind: "text", text: "keypad.step3" },
    { kind: "text", text: "keypad.strike" },
  ],
}
