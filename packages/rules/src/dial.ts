import { Schema } from "effect"
import type { ManualSection } from "./manual"
import type { Rng } from "./rng"

export const WAVE_SHAPES = ["smooth", "square", "ramp", "spike"] as const
export const WaveShape = Schema.Literals(WAVE_SHAPES)
export type WaveShape = typeof WaveShape.Type

/** The trace on the dial's screen. `half` peaks stop at the screen's middle line instead of its top line. */
export const Waveform = Schema.Struct({
  shape: WaveShape,
  peaks: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 })),
  height: Schema.Literals(["full", "half"]),
})
export type Waveform = typeof Waveform.Type

export const DialModule = Schema.Struct({ kind: Schema.Literal("dial"), waveform: Waveform })
export type DialModule = typeof DialModule.Type

/** The frequencies the dial can be set to, inclusive. */
export const DIAL_RANGE = { min: 10, max: 99 } as const

const BASE_FREQUENCIES: Record<WaveShape, { readonly withAE: number; readonly withoutAE: number }> = {
  smooth: { withAE: 42, withoutAE: 57 },
  square: { withAE: 35, withoutAE: 64 },
  ramp: { withAE: 51, withoutAE: 28 },
  spike: { withAE: 23, withoutAE: 46 },
}
const PER_PEAK = 6
const HALF_HEIGHT_DROP = 9

/** The one frequency to send, per DIAL_MANUAL. */
export function solveDial(serial: string, { shape, peaks, height }: Waveform): number {
  const { withAE, withoutAE } = BASE_FREQUENCIES[shape]
  return (/[AE]/.test(serial) ? withAE : withoutAE) + peaks * PER_PEAK - (height === "half" ? HALF_HEIGHT_DROP : 0)
}

const PEAKS = { easy: [1, 3], normal: [1, 4], hard: [2, 5] } as const

export function generateDial(rng: Rng, { difficulty }: { readonly difficulty: keyof typeof PEAKS }): DialModule {
  const [min, max] = PEAKS[difficulty]
  return {
    kind: "dial",
    waveform: {
      shape: rng.pick(WAVE_SHAPES),
      peaks: rng.int(min, max),
      height: difficulty !== "easy" && rng.int(0, 1) === 1 ? "half" : "full",
    },
  }
}

export const DIAL_MANUAL: ManualSection = {
  title: "dial.title",
  blocks: [
    { kind: "text", text: "dial.intro" },
    { kind: "text", text: "dial.step1" },
    {
      kind: "table",
      columns: ["dial.shape", "dial.withAE", "dial.withoutAE"],
      rows: WAVE_SHAPES.map((shape) => [
        { kind: "wave", shape },
        { kind: "number", value: BASE_FREQUENCIES[shape].withAE },
        { kind: "number", value: BASE_FREQUENCIES[shape].withoutAE },
      ]),
    },
    { kind: "text", text: "dial.step2" },
    { kind: "text", text: "dial.step3" },
    { kind: "text", text: "dial.strike" },
  ],
}
