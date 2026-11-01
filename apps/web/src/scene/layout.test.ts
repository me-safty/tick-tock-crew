import { describe, expect, it } from "vitest"
import { FACE, FOOTER, HEADER, MODULE_SLOTS, type Rect } from "./layout"

const edges = ({ x, y, width, height }: Rect) => ({
  left: x - width / 2,
  right: x + width / 2,
  bottom: y - height / 2,
  top: y + height / 2,
})

const overlaps = (a: Rect, b: Rect) => {
  const [p, q] = [edges(a), edges(b)]
  return p.left < q.right && q.left < p.right && p.bottom < q.top && q.bottom < p.top
}

describe("bomb face layout", () => {
  const parts = [HEADER, FOOTER, ...MODULE_SLOTS]

  it("has a slot for each of the four planned modules", () => {
    expect(MODULE_SLOTS).toHaveLength(4)
  })

  it("keeps every part on the face", () => {
    const face = edges(FACE)
    for (const part of parts.map(edges)) {
      expect(part.left).toBeGreaterThanOrEqual(face.left)
      expect(part.right).toBeLessThanOrEqual(face.right)
      expect(part.bottom).toBeGreaterThanOrEqual(face.bottom)
      expect(part.top).toBeLessThanOrEqual(face.top)
    }
  })

  it("never overlaps two parts", () => {
    parts.forEach((a, i) => parts.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)))
  })

  it("fills slots row by row from the top left", () => {
    const [first, second, third] = MODULE_SLOTS
    expect(first?.x).toBeLessThan(second?.x ?? 0)
    expect(first?.y).toBeCloseTo(second?.y ?? 0)
    expect(third?.y).toBeLessThan(first?.y ?? 0)
  })
})
