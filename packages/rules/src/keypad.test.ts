import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Difficulty, generateBomb } from "./bomb"
import { FRAMES, type Glyph, type Key, MARKS, RINGS, sameGlyph, solveKeypad } from "./keypad"

const SEEDS = Array.from({ length: 2000 }, (_, i) => (i * 2_654_435_761) >>> 0)
const bombs = Difficulty.literals.flatMap((difficulty) =>
  SEEDS.map((seed) => ({ difficulty, bomb: generateBomb(seed, difficulty) })),
)

const order = (serial: string, keys: ReadonlyArray<Key>) => Option.getOrUndefined(solveKeypad(serial, keys))
const inRing = (ring: number, glyph: Glyph) => RINGS[ring]?.some((item) => sameGlyph(item, glyph)) ?? false
const ringOf = (glyph: Glyph) => RINGS.findIndex((ring) => ring.some((item) => sameGlyph(item, glyph)))
const key = (ring: number, position: number, live = false): Key => ({ glyph: RINGS[ring]?.[position] ?? RINGS[0][0], live })

describe("glyph rings", () => {
  it("hold every frame and mark pair exactly once", () => {
    for (const frame of FRAMES) {
      for (const mark of MARKS) {
        expect(RINGS.flat().filter((glyph) => sameGlyph(glyph, { frame, mark })), `${frame} ${mark}`).toHaveLength(1)
      }
    }
  })
})

describe("glyph keypad rules", () => {
  it.each([
    {
      case: "forward on an even first digit, wrapping past the last position",
      serial: "PK4PC5",
      keys: [key(1, 0), key(1, 4, true), key(1, 2), key(1, 5)],
      press: [1, 3, 0, 2],
    },
    {
      case: "backward on an odd first digit",
      serial: "PK3PC5",
      keys: [key(1, 0), key(1, 4, true), key(1, 2), key(1, 5)],
      press: [1, 2, 0, 3],
    },
    {
      case: "skipping a dud from another ring",
      serial: "AA0AA0",
      keys: [key(2, 3), key(0, 1), key(2, 5, true), key(2, 1)],
      press: [2, 3, 0],
    },
  ])("presses $press going $case", ({ serial, keys, press }) => {
    expect(order(serial, keys)).toEqual(press)
  })

  it("builds four keys with distinct glyphs, one live, and at most one dud", () => {
    for (const { difficulty, bomb } of bombs) {
      const { keys } = bomb.modules[1]
      const [ring] = keys.filter((key) => key.live).map((key) => ringOf(key.glyph))
      const duds = keys.filter((key) => !inRing(ring ?? -1, key.glyph))
      expect(keys).toHaveLength(4)
      expect(keys.filter((key) => key.live)).toHaveLength(1)
      expect(new Set(keys.map(({ glyph }) => `${glyph.frame} ${glyph.mark}`)).size).toBe(4)
      expect(duds.length).toBeLessThanOrEqual(1)
      if (difficulty === "easy") expect(duds).toHaveLength(0)
      if (difficulty === "hard") expect(duds).toHaveLength(1)
    }
    const normal = bombs.filter(({ difficulty }) => difficulty === "normal")
    const withDud = normal.filter(({ bomb }) => new Set(bomb.modules[1].keys.map((key) => ringOf(key.glyph))).size > 1)
    expect(withDud.length / normal.length).toBeGreaterThan(0.4)
    expect(withDud.length / normal.length).toBeLessThan(0.6)
  })

  it("has exactly one press order on every bomb: every key but the dud, live key first", () => {
    for (const { bomb } of bombs) {
      const { keys } = bomb.modules[1]
      const press = order(bomb.edgework.serial, keys) ?? []
      const live = keys.findIndex((key) => key.live)
      const ring = ringOf(keys[live]?.glyph ?? RINGS[0][0])
      expect(press[0]).toBe(live)
      expect([...press].sort()).toEqual(keys.flatMap((key, index) => (inRing(ring, key.glyph) ? [index] : [])))
    }
  })

  it("needs the Operator's glyphs and serial and the Scanner's live key on every bomb", () => {
    for (const { bomb } of bombs) {
      const { serial } = bomb.edgework
      const { keys } = bomb.modules[1]
      const press = order(serial, keys)
      const otherDigit = serial.replace(/\d/, (digit) => String((Number(digit) + 1) % 10))
      const swapped = (i: number, j: number) =>
        keys.map((key, k) => ({ ...key, glyph: (k === i ? keys[j] : k === j ? keys[i] : key)?.glyph ?? key.glyph }))
      expect(order(otherDigit, keys)).not.toEqual(press)
      expect(keys.some((_, i) => keys.some((_, j) => order(serial, swapped(i, j))?.join() !== press?.join()))).toBe(true)

      const ring = ringOf(keys.find((key) => key.live)?.glyph ?? RINGS[0][0])
      const otherLive = keys.findIndex((key) => !key.live && inRing(ring, key.glyph))
      expect(order(serial, keys.map((key, i) => ({ ...key, live: i === otherLive })))).not.toEqual(press)
    }
  })

  it("needs the Analyst's rings: no rule-free guess finds the order on most bombs", () => {
    const leftToRight = (keys: ReadonlyArray<Key>) => keys.map((_, index) => index)
    const guesses = {
      leftToRight,
      rightToLeft: (keys: ReadonlyArray<Key>) => leftToRight(keys).reverse(),
      liveThenLeftToRight: (keys: ReadonlyArray<Key>) => {
        const live = keys.findIndex((key) => key.live)
        return [live, ...leftToRight(keys).filter((index) => index !== live)]
      },
    }
    for (const guess of Object.values(guesses)) {
      const hits = bombs.filter(({ bomb }) => {
        const press = order(bomb.edgework.serial, bomb.modules[1].keys) ?? []
        return guess(bomb.modules[1].keys).slice(0, press.length).join() === press.join()
      })
      expect(hits.length / bombs.length).toBeLessThan(0.25)
    }
  })
})
