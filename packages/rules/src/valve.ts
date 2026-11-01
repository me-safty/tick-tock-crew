import { Schema } from "effect"
import { type ManualSection, MutableArray } from "./manual"
import type { Rng } from "./rng"

export const HANDLES = ["red", "blue", "yellow", "green"] as const
export const Handle = Schema.Literals(HANDLES)
export type Handle = typeof Handle.Type

export const COILS = [2, 3, 4] as const
export const Coils = Schema.Literals(COILS)
export type Coils = typeof Coils.Type

/** The gauge reads 0 to MAX_PRESSURE; the valve bursts when it gets there. */
export const MAX_PRESSURE = 100

/** How the needle moves: from `start`, rising `rise` points a second while sealed and falling `vent` points a second while held. */
export const Gauge = Schema.Struct({ start: Schema.Number, rise: Schema.Number, vent: Schema.Number })
export type Gauge = typeof Gauge.Type

export const ValveModule = Schema.Struct({ kind: Schema.Literal("valve"), handle: Handle, coils: Coils, gauge: Gauge })
export type ValveModule = typeof ValveModule.Type

export const VALVE_EVENTS = ["hold", "release", "reset"] as const

/** What happened to the valve, stamped with server time in ms. A reset puts the needle back at the gauge's start, sealed. */
export const ValveEvent = Schema.Struct({ kind: Schema.Literals(VALVE_EVENTS), at: Schema.Number })
export type ValveEvent = typeof ValveEvent.Type

/** The valve's history since the match started at `since`, oldest event first. */
export const ValveProgress = Schema.Struct({ since: Schema.Number, events: MutableArray(ValveEvent) })
export type ValveProgress = typeof ValveProgress.Type

export type Band = { readonly low: number; readonly high: number }

const BAND_WIDTH = 12

/**
 * Where each band starts, by handle and coils. The three bands sit 6 points apart, wider than any grace, so one
 * release never fits two of them; all of them top out below the lowest start, so venting always crosses the band.
 */
const BAND_LOWS: Record<Handle, Record<Coils, number>> = {
  red: { 2: 23, 3: 5, 4: 41 },
  blue: { 2: 5, 3: 41, 4: 23 },
  yellow: { 2: 41, 3: 23, 4: 5 },
  green: { 2: 23, 3: 41, 4: 5 },
}

/** The safe band to seal the valve in, per VALVE_MANUAL. Both ends count. */
export function solveValve({ handle, coils }: Pick<ValveModule, "handle" | "coils">): Band {
  const low = BAND_LOWS[handle][coils]
  return { low, high: low + BAND_WIDTH }
}

/**
 * How far past the band a release still counts, in ms of venting. The needle spends 12 / vent seconds in the band
 * (1.3 s on the fastest hard valve, 3 s on the slowest easy one); this adds a quarter second either side.
 */
export const RELEASE_GRACE_MS = 250

/** Whether sealing at `pressure` defuses a valve whose needle falls `vent` points a second. */
export function sealsInBand({ band, pressure, vent }: { band: Band; pressure: number; vent: number }) {
  const grace = (vent * RELEASE_GRACE_MS) / 1000
  return pressure >= band.low - grace && pressure <= band.high + grace
}

type Reading = { readonly pressure: number; readonly held: boolean; readonly at: number }

function advance(gauge: Gauge, { pressure, held, at }: Reading, to: number): Reading {
  const seconds = Math.max(0, to - at) / 1000
  return {
    held,
    at: Math.max(at, to),
    pressure: held ? Math.max(0, pressure - gauge.vent * seconds) : Math.min(MAX_PRESSURE, pressure + gauge.rise * seconds),
  }
}

function apply(gauge: Gauge, reading: Reading, event: ValveEvent): Reading {
  switch (event.kind) {
    case "hold":
      return { ...reading, held: true }
    case "release":
      return { ...reading, held: false }
    case "reset":
      return { ...reading, pressure: gauge.start, held: false }
    default: {
      const _exhaustive: never = event.kind
      return _exhaustive
    }
  }
}

/** The valve right after its last event at or before `time`. */
function lastReading(gauge: Gauge, { since, events }: ValveProgress, time: number): Reading {
  let reading: Reading = { pressure: gauge.start, held: false, at: since }
  for (const event of events) {
    if (event.at > time) break
    reading = apply(gauge, advance(gauge, reading, event.at), event)
  }
  return reading
}

/** The gauge's reading at server time `time`. Pure, so the server judges with it and the Scanner animates with it. */
export const pressureAt = (gauge: Gauge, progress: ValveProgress, time: number) =>
  advance(gauge, lastReading(gauge, progress, time), time).pressure

export const isHeld = (gauge: Gauge, progress: ValveProgress) => lastReading(gauge, progress, Infinity).held

/** When the needle reaches MAX_PRESSURE if nobody touches the valve, or null while it is held. */
export function burstAt(gauge: Gauge, progress: ValveProgress): number | null {
  const reading = lastReading(gauge, progress, Infinity)
  if (reading.held) return null
  return reading.at + Math.ceil(((MAX_PRESSURE - reading.pressure) / gauge.rise) * 1000)
}

const RATES = {
  easy: { rise: 0.1, vent: [4, 5] },
  normal: { rise: 0.13, vent: [5, 7] },
  hard: { rise: 0.16, vent: [7, 9] },
} as const

const START = { min: 55, max: 85 } as const

export function generateValve(rng: Rng, { difficulty }: { readonly difficulty: keyof typeof RATES }): ValveModule {
  const { rise, vent } = RATES[difficulty]
  return {
    kind: "valve",
    handle: rng.pick(HANDLES),
    coils: rng.pick(COILS),
    gauge: { start: rng.int(START.min, START.max), rise, vent: rng.int(vent[0], vent[1]) },
  }
}

export const VALVE_MANUAL: ManualSection = {
  title: "valve.title",
  blocks: [
    { kind: "text", text: "valve.intro" },
    { kind: "text", text: "valve.step1" },
    {
      kind: "table",
      columns: ["valve.handle", "valve.twoCoils", "valve.threeCoils", "valve.fourCoils"],
      rows: HANDLES.map((handle) => [
        { kind: "color", color: handle },
        ...COILS.map((coils) => ({ kind: "band" as const, ...solveValve({ handle, coils }) })),
      ]),
    },
    { kind: "text", text: "valve.step2" },
    { kind: "text", text: "valve.strike" },
  ],
}
