import type { Waveform } from "@tick-tock-crew/rules"

/** Where a full trace peaks on the screen, with 1 at the top edge; a half trace peaks at half of it. */
export const FULL_HEIGHT = 0.8
const SPIKE_HALF_WIDTH = 0.12

type Point = readonly [x: number, y: number]

/** The trace as points from x = 0 to 1, with y from -1 (bottom edge) to 1 (top edge). */
export function tracePoints({ shape, peaks, height }: Waveform): ReadonlyArray<Point> {
  const top = height === "full" ? FULL_HEIGHT : FULL_HEIGHT / 2
  const cycles = Array.from({ length: peaks }, (_, i) => ({ start: i / peaks, mid: (i + 0.5) / peaks, end: (i + 1) / peaks }))
  switch (shape) {
    case "smooth": {
      const samples = peaks * 48
      return Array.from({ length: samples + 1 }, (_, i): Point => [i / samples, top * Math.sin((2 * Math.PI * peaks * i) / samples)])
    }
    case "square":
      return [
        [0, 0],
        ...cycles.flatMap(({ start, mid, end }): Point[] => [
          [start, top],
          [mid, top],
          [mid, -top],
          [end, -top],
        ]),
        [1, 0],
      ]
    case "ramp":
      return [[0, 0], [0, -top], ...cycles.flatMap(({ end }): Point[] => [[end, top], [end, -top]]), [1, 0]]
    case "spike": {
      const half = SPIKE_HALF_WIDTH / peaks
      return [
        [0, 0],
        ...cycles.flatMap(({ mid }): Point[] => [
          [mid - half, 0],
          [mid, top],
          [mid + half, 0],
        ]),
        [1, 0],
      ]
    }
    default: {
      const _exhaustive: never = shape
      return _exhaustive
    }
  }
}

/** The trace scaled into a `width` x `height` box, y pointing down as in SVG and canvas. */
export function tracePath(waveform: Waveform, { width, height }: { width: number; height: number }) {
  return tracePoints(waveform)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${(x * width).toFixed(2)} ${((1 - y) * (height / 2)).toFixed(2)}`)
    .join(" ")
}
