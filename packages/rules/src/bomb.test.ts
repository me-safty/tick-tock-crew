import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { Bomb, Difficulty, generateBomb } from "./bomb"
import { COLORS, solveWires, type Wire } from "./wires"

const SEEDS = Array.from({ length: 2000 }, (_, i) => (i * 2_654_435_761) >>> 0)
const DIFFICULTIES = Difficulty.literals

function wiresOf(bomb: Bomb) {
  return bomb.modules[0].wires
}

const answer = (serial: string, wires: ReadonlyArray<Wire>) => Option.getOrUndefined(solveWires(serial, wires))

// The Operator alone knows colors and the serial: some other colors or serial must change the answer.
function needsOperator(serial: string, wires: ReadonlyArray<Wire>) {
  const cut = answer(serial, wires)
  const otherSerials = Array.from({ length: 10 }, (_, digit) => serial.slice(0, -1) + digit)
  const recolored = wires.flatMap((_, i) =>
    COLORS.map((color) => wires.map((wire, j) => (i === j ? { ...wire, color } : wire))),
  )
  return (
    otherSerials.some((other) => answer(other, wires) !== cut) ||
    recolored.some((other) => answer(serial, other) !== cut)
  )
}

// The Scanner alone knows the tags: some other placement of the same tags must change the answer.
function needsScanner(serial: string, wires: ReadonlyArray<Wire>) {
  const cut = answer(serial, wires)
  return wires.some((a, i) =>
    wires.some((b, j) => {
      const swapped = wires.map((wire, k) =>
        k === i ? { ...wire, tag: b.tag } : k === j ? { ...wire, tag: a.tag } : wire,
      )
      return answer(serial, swapped) !== cut
    }),
  )
}

function digitIndex(wires: ReadonlyArray<Wire>, pick: (...digits: number[]) => number) {
  const digit = pick(...wires.map((wire) => wire.tag.digit))
  return wires.findIndex((wire) => wire.tag.digit === digit)
}

describe("generateBomb", () => {
  it("gives the same bomb for the same seed and difficulty", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      for (const difficulty of DIFFICULTIES) {
        expect(generateBomb(seed, difficulty)).toStrictEqual(generateBomb(seed, difficulty))
      }
    }
  })

  it("gives different bombs for different seeds", () => {
    const serials = new Set(SEEDS.map((seed) => generateBomb(seed, "normal").edgework.serial))
    expect(serials.size).toBeGreaterThan(SEEDS.length * 0.95)
  })

  it("is pinned to its PRNG, so stored seeds keep their bombs", () => {
    expect(generateBomb(42, "normal")).toMatchInlineSnapshot(`
      {
        "edgework": {
          "serial": "PK8PC5",
        },
        "modules": [
          {
            "kind": "wires",
            "wires": [
              {
                "color": "red",
                "tag": {
                  "digit": 3,
                  "letter": "A",
                },
              },
              {
                "color": "yellow",
                "tag": {
                  "digit": 6,
                  "letter": "T",
                },
              },
              {
                "color": "red",
                "tag": {
                  "digit": 7,
                  "letter": "P",
                },
              },
              {
                "color": "white",
                "tag": {
                  "digit": 2,
                  "letter": "A",
                },
              },
            ],
          },
          {
            "keys": [
              {
                "glyph": {
                  "frame": "circle",
                  "mark": "dot",
                },
                "live": false,
              },
              {
                "glyph": {
                  "frame": "square",
                  "mark": "stem",
                },
                "live": true,
              },
              {
                "glyph": {
                  "frame": "arch",
                  "mark": "stem",
                },
                "live": false,
              },
              {
                "glyph": {
                  "frame": "circle",
                  "mark": "hook",
                },
                "live": false,
              },
            ],
            "kind": "keypad",
          },
          {
            "kind": "dial",
            "waveform": {
              "height": "half",
              "peaks": 4,
              "shape": "ramp",
            },
          },
          {
            "coils": 2,
            "gauge": {
              "rise": 0.13,
              "start": 64,
              "vent": 5,
            },
            "handle": "red",
            "kind": "valve",
          },
        ],
      }
    `)
  })

  it.each(DIFFICULTIES)("builds valid %s bombs with 3 to 6 wires and distinct tag digits", (difficulty) => {
    const isBomb = Schema.is(Bomb)
    for (const seed of SEEDS) {
      const bomb = generateBomb(seed, difficulty)
      const wires = wiresOf(bomb)
      expect(isBomb(bomb)).toBe(true)
      expect(wires.length).toBeGreaterThanOrEqual(3)
      expect(wires.length).toBeLessThanOrEqual(6)
      expect(new Set(wires.map((wire) => wire.tag.digit)).size).toBe(wires.length)
    }
  })
})

describe("hidden wires rules", () => {
  const wire = (color: Wire["color"], letter: Wire["tag"]["letter"], digit: number): Wire => ({ color, tag: { letter, digit } })
  const blackOnce = [wire("black", "K", 5), wire("red", "A", 2), wire("blue", "E", 9), wire("green", "H", 4)]

  it.each([
    {
      case: "two key wires, one tag letter in the serial",
      serial: "PK8PC5",
      wires: [wire("red", "A", 3), wire("yellow", "T", 6), wire("red", "P", 7), wire("white", "A", 2)],
      cut: 2,
    },
    { case: "one key wire, no tag letter in the serial", serial: "MX2TR4", wires: blackOnce, cut: 1 },
    { case: "one key wire, two tag letters in the serial", serial: "AE2TR4", wires: blackOnce, cut: 2 },
  ])("cut wire $cut with $case", ({ serial, wires, cut }) => {
    expect(answer(serial, wires)).toBe(cut)
  })

  const bombs = DIFFICULTIES.flatMap((difficulty) => SEEDS.map((seed) => generateBomb(seed, difficulty)))

  it("have exactly one wire to cut on every bomb", () => {
    for (const bomb of bombs) {
      const cut = answer(bomb.edgework.serial, wiresOf(bomb))
      expect(cut).toBeTypeOf("number")
      expect(wiresOf(bomb)[cut ?? -1]).toBeDefined()
    }
  })

  it("need the Operator's colors or serial and the Scanner's tags on every bomb", () => {
    for (const bomb of bombs) {
      expect(needsOperator(bomb.edgework.serial, wiresOf(bomb))).toBe(true)
      expect(needsScanner(bomb.edgework.serial, wiresOf(bomb))).toBe(true)
    }
  })

  it("need the Analyst's manual: no rule-free guess finds the wire on most bombs", () => {
    const guesses = {
      first: () => 0,
      last: (wires: ReadonlyArray<Wire>) => wires.length - 1,
      lowestTag: (wires: ReadonlyArray<Wire>) => digitIndex(wires, Math.min),
      highestTag: (wires: ReadonlyArray<Wire>) => digitIndex(wires, Math.max),
    }
    for (const guess of Object.values(guesses)) {
      const hits = bombs.filter((bomb) => guess(wiresOf(bomb)) === answer(bomb.edgework.serial, wiresOf(bomb)))
      expect(hits.length / bombs.length).toBeLessThan(0.35)
    }
  })
})
