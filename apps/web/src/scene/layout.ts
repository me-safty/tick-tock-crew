import type { Vec3 } from "./look"

/** Rectangles on the bomb's front face, centered at (x, y), in meters. */
export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export const TABLE_TOP_Y = 0.79

export const CASE = { width: 1.4, height: 1.1, depth: 0.5 } as const
export const BOMB_POSITION: Vec3 = [0, TABLE_TOP_Y + CASE.height / 2, 0]
export const FACE_Z = CASE.depth / 2 + 0.012

export const FACE: Rect = { x: 0, y: 0, width: 1.28, height: 1 }
const GAP = 0.03
const HEADER_HEIGHT = 0.16
const FOOTER_HEIGHT = 0.1
const INNER_WIDTH = FACE.width - 2 * GAP

export const HEADER: Rect = { x: 0, y: FACE.height / 2 - GAP - HEADER_HEIGHT / 2, width: INNER_WIDTH, height: HEADER_HEIGHT }
export const FOOTER: Rect = { x: 0, y: -FACE.height / 2 + GAP + FOOTER_HEIGHT / 2, width: INNER_WIDTH, height: FOOTER_HEIGHT }

function gridSlots({ area, columns, rows }: { area: Rect; columns: number; rows: number }): Rect[] {
  const width = (area.width - GAP * (columns - 1)) / columns
  const height = (area.height - GAP * (rows - 1)) / rows
  return Array.from({ length: columns * rows }, (_, i) => ({
    x: area.x - area.width / 2 + width / 2 + (i % columns) * (width + GAP),
    y: area.y + area.height / 2 - height / 2 - Math.floor(i / columns) * (height + GAP),
    width,
    height,
  }))
}

const SLOT_AREA_TOP = HEADER.y - HEADER.height / 2 - GAP
const SLOT_AREA_BOTTOM = FOOTER.y + FOOTER.height / 2 + GAP

/** Module i sits in slot i, row by row from the top left: Hidden wires first, then room for three more modules. */
export const MODULE_SLOTS = gridSlots({
  area: {
    x: 0,
    y: (SLOT_AREA_TOP + SLOT_AREA_BOTTOM) / 2,
    width: INNER_WIDTH,
    height: SLOT_AREA_TOP - SLOT_AREA_BOTTOM,
  },
  columns: 2,
  rows: 2,
})

export function slotRect(index: number) {
  const rect = MODULE_SLOTS[index]
  if (!rect) throw new Error(`The bomb has no slot ${index}`)
  return rect
}
