import { describe, expect, it } from "@effect/vitest"
import { Difficulty, generateBomb } from "./bomb"
import { DIAL_RANGE, solveDial, WAVE_SHAPES, type Waveform } from "./dial"

const SEEDS = Array.from({ length: 2000 }, (_, i) => (i * 2_654_435_761) >>> 0)
const bombs = Difficulty.literals.flatMap((difficulty) =>
  SEEDS.map((seed) => ({ difficulty, bomb: generateBomb(seed, difficulty) })),
)

describe("frequency dial rules", () => {
  it.each([
    { case: "a serial with A", serial: "AK3PC5", waveform: { shape: "smooth", peaks: 2, height: "full" }, frequency: 54 },
    { case: "a serial with E", serial: "PK3EC5", waveform: { shape: "spike", peaks: 5, height: "full" }, frequency: 53 },
    { case: "a serial without A or E", serial: "PK3MC5", waveform: { shape: "square", peaks: 1, height: "half" }, frequency: 61 },
    { case: "a half-height ramp", serial: "TX0RH9", waveform: { shape: "ramp", peaks: 3, height: "half" }, frequency: 37 },
  ] satisfies ReadonlyArray<{ case: string; serial: string; waveform: Waveform; frequency: number }>)(
    "sends $frequency for $case",
    ({ serial, waveform, frequency }) => {
      expect(solveDial(serial, waveform)).toBe(frequency)
    },
  )

  it("puts the frequency on the dial and keeps easy waveforms simple", () => {
    for (const { difficulty, bomb } of bombs) {
      const { waveform } = bomb.modules[2]
      const frequency = solveDial(bomb.edgework.serial, waveform)
      expect(Number.isInteger(frequency)).toBe(true)
      expect(frequency).toBeGreaterThanOrEqual(DIAL_RANGE.min)
      expect(frequency).toBeLessThanOrEqual(DIAL_RANGE.max)
      if (difficulty === "easy") expect(waveform.height).toBe("full")
      if (difficulty === "easy") expect(waveform.peaks).toBeLessThanOrEqual(3)
      if (difficulty === "hard") expect(waveform.peaks).toBeGreaterThanOrEqual(2)
    }
    for (const shape of WAVE_SHAPES) {
      expect(bombs.some(({ bomb }) => bomb.modules[2].waveform.shape === shape)).toBe(true)
    }
    expect(bombs.some(({ bomb }) => bomb.modules[2].waveform.height === "half")).toBe(true)
  })

  it("needs the Operator's serial and every feature the Scanner reads on every bomb", () => {
    for (const { bomb } of bombs) {
      const { serial } = bomb.edgework
      const { waveform } = bomb.modules[2]
      const frequency = solveDial(serial, waveform)
      const otherSerial = /[AE]/.test(serial) ? serial.replace(/[AE]/g, "K") : `A${serial.slice(1)}`
      expect(solveDial(otherSerial, waveform)).not.toBe(frequency)
      expect(solveDial(serial, { ...waveform, peaks: waveform.peaks === 1 ? 2 : 1 })).not.toBe(frequency)
      expect(solveDial(serial, { ...waveform, height: waveform.height === "full" ? "half" : "full" })).not.toBe(frequency)
      const otherShapes = WAVE_SHAPES.filter((shape) => shape !== waveform.shape)
      expect(otherShapes.some((shape) => solveDial(serial, { ...waveform, shape }) !== frequency)).toBe(true)
    }
  })

  it("needs the Analyst's table: no rule-free guess finds the frequency on most bombs", () => {
    const counts = new Map<number, number>()
    for (const { bomb } of bombs) {
      const frequency = solveDial(bomb.edgework.serial, bomb.modules[2].waveform)
      counts.set(frequency, (counts.get(frequency) ?? 0) + 1)
    }
    expect(Math.max(...counts.values()) / bombs.length).toBeLessThan(0.1)
  })
})
