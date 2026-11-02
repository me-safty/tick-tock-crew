import { describe, expect, test } from "vitest"
import { KEY_Y, keyX, slotRect, wireLayout } from "./layout"
import { type ModuleShape, targetAt, targetRect } from "./pingTargets"

const MODULES: ReadonlyArray<ModuleShape> = [
  { kind: "wires", wires: [0, 1, 2, 3, 4] },
  { kind: "keypad", keys: [0, 1, 2, 3] },
  { kind: "dial" },
  { kind: "valve" },
]

const center = ({ x, y }: { x: number; y: number }) => ({ x, y })

describe("targetAt", () => {
  test("finds each wire by its height in the wires slot", () => {
    const rect = slotRect(0)
    const { ys } = wireLayout({ rect, count: 5 })
    ys.forEach((y, wire) => {
      expect(targetAt(MODULES, { x: rect.x, y: rect.y + y })).toEqual({ kind: "wire", module: 0, wire })
    })
  })

  test("finds each key on the keypad, and the module around the keys", () => {
    const rect = slotRect(1)
    for (let key = 0; key < 4; key++) {
      expect(targetAt(MODULES, { x: rect.x + keyX(key, 4), y: rect.y + KEY_Y })).toEqual({ kind: "key", module: 1, key })
    }
    expect(targetAt(MODULES, { x: rect.x, y: rect.y - rect.height / 2 + 0.01 })).toEqual({ kind: "module", module: 1 })
  })

  test("points at the whole dial or valve", () => {
    expect(targetAt(MODULES, center(slotRect(2)))).toEqual({ kind: "module", module: 2 })
    expect(targetAt(MODULES, center(slotRect(3)))).toEqual({ kind: "module", module: 3 })
  })

  test("finds nothing off the module slots", () => {
    expect(targetAt(MODULES, { x: 0, y: 0.48 })).toBeNull()
    expect(targetAt(MODULES, { x: 2, y: 0 })).toBeNull()
  })
})

describe("targetRect", () => {
  test("frames the part targetAt found there", () => {
    const targets = [
      { kind: "wire", module: 0, wire: 3 },
      { kind: "key", module: 1, key: 2 },
      { kind: "module", module: 3 },
    ] as const
    for (const target of targets) {
      expect(targetAt(MODULES, center(targetRect(MODULES, target)))).toEqual(target)
    }
  })
})
