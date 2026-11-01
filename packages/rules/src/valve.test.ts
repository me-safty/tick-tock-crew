import { describe, expect, it } from "@effect/vitest"
import { Difficulty, generateBomb } from "./bomb"
import {
  burstAt,
  COILS,
  type Gauge,
  HANDLES,
  isHeld,
  MAX_PRESSURE,
  pressureAt,
  RELEASE_GRACE_MS,
  sealsInBand,
  solveValve,
  type ValveEvent,
  type ValveModule,
} from "./valve"

const SEEDS = Array.from({ length: 2000 }, (_, i) => (i * 2_654_435_761) >>> 0)
const valves = Difficulty.literals.flatMap((difficulty) =>
  SEEDS.map((seed) => ({ difficulty, valve: generateBomb(seed, difficulty).modules[3] })),
)

const SINCE = 1_000_000
const gauge: Gauge = { start: 60, rise: 0.15, vent: 6 }
const progress = (...events: ReadonlyArray<ValveEvent>) => ({ since: SINCE, events: [...events] })
const event = (kind: ValveEvent["kind"], afterMs: number): ValveEvent => ({ kind, at: SINCE + afterMs })

/** When a valve held from the start reads `pressure`. */
const heldUntil = ({ start, vent }: Gauge, pressure: number) => SINCE + ((start - pressure) / vent) * 1000

/** Whether holding from the start and letting go at `at` defuses the valve. */
const sealsAt = (valve: ValveModule, at: number) =>
  sealsInBand({
    band: solveValve(valve),
    pressure: pressureAt(valve.gauge, progress(event("hold", 0)), at),
    vent: valve.gauge.vent,
  })

describe("pressureAt", () => {
  it("starts at the gauge's start, rises while sealed and falls while held", () => {
    const history = progress(event("hold", 10_000), event("release", 12_000))
    expect(pressureAt(gauge, history, SINCE)).toBe(60)
    expect(pressureAt(gauge, history, SINCE + 10_000)).toBeCloseTo(61.5)
    expect(pressureAt(gauge, history, SINCE + 12_000)).toBeCloseTo(49.5)
    expect(pressureAt(gauge, history, SINCE + 22_000)).toBeCloseTo(51)
  })

  it("is continuous, except where a reset puts the needle back at its start", () => {
    const history = progress(event("hold", 3_000), event("release", 5_000), event("hold", 9_000), event("release", 9_500))
    for (const { at } of history.events) {
      expect(pressureAt(gauge, history, at - 1)).toBeCloseTo(pressureAt(gauge, history, at + 1), 1)
    }
    const reset = progress(event("hold", 0), event("release", 4_000), event("reset", 4_000))
    expect(pressureAt(gauge, reset, SINCE + 3_999)).toBeCloseTo(36, 1)
    expect(pressureAt(gauge, reset, SINCE + 4_000)).toBe(60)
  })

  it("never rises while held, never falls while sealed, and stays on the gauge", () => {
    const history = progress(event("hold", 1_000), event("release", 20_000), event("hold", 21_000), event("release", 21_500))
    const held = (at: number) => history.events.filter((e) => e.at <= at).at(-1)?.kind === "hold"
    let previous = pressureAt(gauge, history, SINCE)
    for (let at = SINCE + 100; at <= SINCE + 400_000; at += 100) {
      const pressure = pressureAt(gauge, history, at)
      if (held(at - 100) && held(at)) expect(pressure).toBeLessThanOrEqual(previous)
      if (!held(at - 100) && !held(at)) expect(pressure).toBeGreaterThanOrEqual(previous)
      expect(pressure).toBeGreaterThanOrEqual(0)
      expect(pressure).toBeLessThanOrEqual(MAX_PRESSURE)
      previous = pressure
    }
  })

  it("knows whether the valve is held", () => {
    expect(isHeld(gauge, progress())).toBe(false)
    expect(isHeld(gauge, progress(event("hold", 0)))).toBe(true)
    expect(isHeld(gauge, progress(event("hold", 0), event("release", 1)))).toBe(false)
  })
})

describe("burstAt", () => {
  it("is when a sealed needle reaches the top, and never while held", () => {
    expect(burstAt(gauge, progress())).toBe(SINCE + Math.ceil((40 / 0.15) * 1000))
    expect(pressureAt(gauge, progress(), burstAt(gauge, progress()) ?? 0)).toBe(MAX_PRESSURE)
    expect(burstAt(gauge, progress(event("hold", 1_000)))).toBeNull()
    const vented = progress(event("hold", 0), event("release", 5_000))
    expect(burstAt(gauge, vented)).toBe(SINCE + 5_000 + Math.ceil((70 / 0.15) * 1000))
  })
})

describe("sealsInBand", () => {
  it("takes the band and a quarter second of venting either side, and nothing past that", () => {
    const valve: ValveModule = { kind: "valve", handle: "red", coils: 2, gauge }
    const { low, high } = solveValve(valve)
    const grace = RELEASE_GRACE_MS
    expect(sealsAt(valve, heldUntil(gauge, high) - grace - 1)).toBe(false)
    expect(sealsAt(valve, heldUntil(gauge, high) - grace + 1)).toBe(true)
    expect(sealsAt(valve, heldUntil(gauge, (low + high) / 2))).toBe(true)
    expect(sealsAt(valve, heldUntil(gauge, low) + grace - 1)).toBe(true)
    expect(sealsAt(valve, heldUntil(gauge, low) + grace + 1)).toBe(false)
  })
})

describe("pressure valve rules", () => {
  it("gives every valve one band below its start, crossed while held for long enough to call", () => {
    for (const { valve } of valves) {
      const { low, high } = solveValve(valve)
      expect(high - low).toBe(12)
      expect(low).toBeGreaterThan(0)
      expect(high + (valve.gauge.vent * RELEASE_GRACE_MS) / 1000).toBeLessThan(valve.gauge.start)
      expect(sealsAt(valve, heldUntil(valve.gauge, (low + high) / 2))).toBe(true)
      expect(((high - low) / valve.gauge.vent) * 1000 + 2 * RELEASE_GRACE_MS).toBeGreaterThanOrEqual(1800)
    }
  })

  it("leaves a minute and a half before an untouched valve first bursts", () => {
    for (const { valve } of valves) {
      expect((burstAt(valve.gauge, progress()) ?? 0) - SINCE).toBeGreaterThanOrEqual(90_000)
    }
  })

  it("never fits one release into two bands", () => {
    const bands = HANDLES.flatMap((handle) => COILS.map((coils) => solveValve({ handle, coils })))
    for (const vent of [4, 9]) {
      for (let pressure = 0; pressure <= MAX_PRESSURE; pressure += 0.25) {
        const fits = new Set(bands.filter((band) => sealsInBand({ band, pressure, vent })).map((band) => band.low))
        expect(fits.size).toBeLessThanOrEqual(1)
      }
    }
  })

  it("needs the Operator's handle and the Scanner's coils on every bomb", () => {
    for (const { valve } of valves) {
      const band = solveValve(valve)
      expect(HANDLES.some((handle) => solveValve({ ...valve, handle }).low !== band.low)).toBe(true)
      expect(COILS.some((coils) => solveValve({ ...valve, coils }).low !== band.low)).toBe(true)
    }
  })

  it("needs the Analyst's table: no single pressure seals most valves", () => {
    for (let pressure = 0; pressure <= MAX_PRESSURE; pressure += 0.5) {
      const sealed = valves.filter(({ valve }) => sealsInBand({ band: solveValve(valve), pressure, vent: valve.gauge.vent }))
      expect(sealed.length / valves.length).toBeLessThan(0.4)
    }
  })

  it("needs the Scanner's gauge: holding blind for a set time is a coin flip at best", () => {
    for (const difficulty of Difficulty.literals) {
      const ofDifficulty = valves.filter((entry) => entry.difficulty === difficulty).map(({ valve }) => valve)
      const typical = {
        start: ofDifficulty.reduce((sum, valve) => sum + valve.gauge.start, 0) / ofDifficulty.length,
        vent: ofDifficulty.reduce((sum, valve) => sum + valve.gauge.vent, 0) / ofDifficulty.length,
      }
      const sealed = ofDifficulty.filter((valve) => {
        const { low, high } = solveValve(valve)
        const blindMs = ((typical.start - (low + high) / 2) / typical.vent) * 1000
        return sealsAt(valve, SINCE + blindMs)
      })
      expect(sealed.length / ofDifficulty.length).toBeLessThan(0.55)
    }
  })
})
