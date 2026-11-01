import type { Glyph } from "@tick-tock-crew/rules"

/** Glyphs are drawn in a 100 x 100 box as one stroked path, so SVG and canvas (via Path2D) share it. */
export const GLYPH_BOX = 100
export const GLYPH_STROKE = 7

type Frame = { readonly path: string; readonly center: readonly [number, number]; readonly scale: number }

const FRAMES: Record<Glyph["frame"], Frame> = {
  circle: { path: "M 12 50 A 38 38 0 1 0 88 50 A 38 38 0 1 0 12 50", center: [50, 50], scale: 1 },
  triangle: { path: "M 50 9 L 91 85 L 9 85 Z", center: [50, 61], scale: 0.72 },
  square: { path: "M 14 14 H 86 V 86 H 14 Z", center: [50, 50], scale: 1 },
  arch: { path: "M 14 88 V 50 A 36 36 0 0 1 86 50 V 88", center: [50, 58], scale: 0.9 },
}

// A tiny stroked circle reads as a filled dot at any stroke width.
const dot = (x: number, y: number) => `M ${x - 3} ${y} a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0`

function markPath(mark: Glyph["mark"], [x, y]: readonly [number, number], scale: number) {
  const s = (value: number) => value * scale
  switch (mark) {
    case "dot":
      return dot(x, y)
    case "dash":
      return `M ${x - s(16)} ${y} H ${x + s(16)}`
    case "stem":
      return `M ${x} ${y - s(16)} V ${y + s(16)}`
    case "cross":
      return `M ${x - s(12)} ${y - s(12)} L ${x + s(12)} ${y + s(12)} M ${x + s(12)} ${y - s(12)} L ${x - s(12)} ${y + s(12)}`
    case "hook":
      return `M ${x - s(15)} ${y + s(8)} L ${x} ${y - s(9)} L ${x + s(15)} ${y + s(8)}`
    case "pair":
      return `${dot(x - s(12), y)} ${dot(x + s(12), y)}`
    default: {
      const _exhaustive: never = mark
      return _exhaustive
    }
  }
}

export function glyphPath({ frame, mark }: Glyph) {
  const { path, center, scale } = FRAMES[frame]
  return `${path} ${markPath(mark, center, scale)}`
}
