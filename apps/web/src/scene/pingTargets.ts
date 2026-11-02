import type { BombTarget } from "../pings"
import { KEY_PITCH, KEY_SIZE, KEY_Y, keyX, MODULE_SLOTS, type Rect, slotRect, wireLayout } from "./layout"

/** How many wires or keys a module has: all a ping needs to know about it. */
export type ModuleShape =
  | { readonly kind: "wires"; readonly wires: ReadonlyArray<unknown> }
  | { readonly kind: "keypad"; readonly keys: ReadonlyArray<unknown> }
  | { readonly kind: "dial" | "valve" }

const contains = (rect: Rect, { x, y }: { x: number; y: number }) =>
  Math.abs(x - rect.x) <= rect.width / 2 && Math.abs(y - rect.y) <= rect.height / 2

/** The part of the bomb at a point on its face (meters from the face's center), or null between modules. */
export function targetAt(modules: ReadonlyArray<ModuleShape>, point: { x: number; y: number }): BombTarget | null {
  const index = MODULE_SLOTS.findIndex((slot) => contains(slot, point))
  const module = modules[index]
  const rect = MODULE_SLOTS[index]
  if (!module || !rect) return null
  const local = { x: point.x - rect.x, y: point.y - rect.y }
  switch (module.kind) {
    case "wires": {
      const { spacing, ys } = wireLayout({ rect, count: module.wires.length })
      const wire = ys.findIndex((y) => Math.abs(local.y - y) <= spacing / 2)
      return wire >= 0 ? { kind: "wire", module: index, wire } : { kind: "module", module: index }
    }
    case "keypad": {
      const count = module.keys.length
      const key = module.keys.findIndex(
        (_, i) => Math.abs(local.x - keyX(i, count)) <= KEY_PITCH / 2 && Math.abs(local.y - KEY_Y) <= KEY_SIZE / 2,
      )
      return key >= 0 ? { kind: "key", module: index, key } : { kind: "module", module: index }
    }
    case "dial":
    case "valve":
      return { kind: "module", module: index }
    default: {
      const _exhaustive: never = module
      return _exhaustive
    }
  }
}

const OUTSET = 0.02

/** The rectangle on the bomb's face to light up for a ping. */
export function targetRect(modules: ReadonlyArray<ModuleShape>, target: BombTarget): Rect {
  const rect = slotRect(target.module)
  const module = modules[target.module]
  switch (target.kind) {
    case "module":
      return { ...rect, width: rect.width + OUTSET, height: rect.height + OUTSET }
    case "wire": {
      const { span, spacing, ys } = wireLayout({ rect, count: module?.kind === "wires" ? module.wires.length : 1 })
      return { x: rect.x, y: rect.y + (ys[target.wire] ?? 0), width: span + OUTSET, height: Math.min(spacing, 0.06) }
    }
    case "key": {
      const count = module?.kind === "keypad" ? module.keys.length : 1
      return { x: rect.x + keyX(target.key, count), y: rect.y + KEY_Y, width: KEY_SIZE + OUTSET, height: KEY_SIZE + OUTSET }
    }
    default: {
      const _exhaustive: never = target
      return _exhaustive
    }
  }
}
