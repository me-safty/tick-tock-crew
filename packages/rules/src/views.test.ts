import { assert, describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { type Bomb, generateBomb } from "./bomb"
import { initialState } from "./match"
import { AnalystView, OperatorView, ScannerView, viewFor } from "./views"

const bomb = generateBomb(11, "hard")
const state = { strikes: 1, modules: [{ kind: "wires" as const, solved: false, progress: { cut: [1] } }] }

function withWires(source: Bomb, change: (wire: Bomb["modules"][0]["wires"][number]) => object): Bomb {
  const [module] = source.modules
  return { ...source, modules: [{ ...module, wires: module.wires.map((wire) => ({ ...wire, ...change(wire) })) }] }
}

function keysOf(value: unknown): Set<string> {
  if (Array.isArray(value)) return new Set(value.flatMap((item) => [...keysOf(item)]))
  if (typeof value !== "object" || value === null) return new Set()
  return new Set(Object.entries(value).flatMap(([key, item]) => [key, ...keysOf(item)]))
}

describe("viewFor", () => {
  it("shows the Operator colors, cuts and the serial, but no tags or manual", () => {
    const view = viewFor(bomb, state, "operator")
    assert(Schema.is(OperatorView)(view))
    expect(view.serial).toBe(bomb.edgework.serial)
    expect(keysOf(view)).toEqual(new Set(["role", "serial", "modules", "kind", "solved", "wires", "color", "cut"]))
    expect(view.modules[0]?.wires.map((wire) => wire.cut).indexOf(true)).toBe(1)
  })

  it("shows the Scanner tags and cuts, but no colors, serial or manual", () => {
    const view = viewFor(bomb, state, "scanner")
    expect(Schema.is(ScannerView)(view)).toBe(true)
    expect(keysOf(view)).toEqual(new Set(["role", "modules", "kind", "solved", "wires", "tag", "letter", "digit", "cut"]))
  })

  it("shows the Analyst the manual and module progress, but nothing of the bomb itself", () => {
    const view = viewFor(bomb, state, "analyst")
    expect(Schema.is(AnalystView)(view)).toBe(true)
    expect(view).toMatchObject({ modules: [{ kind: "wires", solved: false }], manual: [{ title: "Hidden wires" }] })
    expect(keysOf(view.modules)).toEqual(new Set(["kind", "solved"]))
  })

  it("gives each role the same view whatever the bomb hides from them", () => {
    const otherTags = withWires(bomb, (wire) => ({ tag: { ...wire.tag, digit: 10 - wire.tag.digit } }))
    const otherColors = { ...withWires(bomb, () => ({ color: "green" })), edgework: { serial: "XX0XX0" } }
    expect(viewFor(otherTags, state, "operator")).toEqual(viewFor(bomb, state, "operator"))
    expect(viewFor(otherColors, state, "scanner")).toEqual(viewFor(bomb, state, "scanner"))
    expect(viewFor(generateBomb(12, "easy"), initialState(bomb), "analyst")).toEqual(
      viewFor(bomb, initialState(bomb), "analyst"),
    )
  })
})
