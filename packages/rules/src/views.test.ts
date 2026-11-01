import { assert, describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { type Bomb, generateBomb } from "./bomb"
import { initialState, type MatchState } from "./match"
import { MAX_PRESSURE } from "./valve"
import { AnalystView, OperatorView, ScannerView, viewFor } from "./views"

const bomb = generateBomb(11, "hard")
const [wiresModule, keypadModule, dialModule, valveModule] = bomb.modules
const valveEvents = [{ kind: "hold", at: 5_000 }] as const
const state: MatchState = {
  strikes: 1,
  modules: [
    { kind: "wires", solved: false, progress: { cut: [1] } },
    { kind: "keypad", solved: false, progress: { pressed: [2] } },
    { kind: "dial", solved: true },
    { kind: "valve", solved: false, progress: { since: 1_000, events: [...valveEvents] } },
  ],
}

function keysOf(value: unknown): Set<string> {
  if (Array.isArray(value)) return new Set(value.flatMap((item) => [...keysOf(item)]))
  if (typeof value !== "object" || value === null) return new Set()
  return new Set(Object.entries(value).flatMap(([key, item]) => [key, ...keysOf(item)]))
}

/** The bomb with everything `role` may not see swapped for something else. */
function withHidden(source: Bomb, hidden: "operator" | "scanner"): Bomb {
  const [wires, keypad, dial, valve] = source.modules
  return hidden === "operator"
    ? {
        ...source,
        modules: [
          { ...wires, wires: wires.wires.map((wire) => ({ ...wire, tag: { ...wire.tag, digit: 10 - wire.tag.digit } })) },
          { ...keypad, keys: keypad.keys.map((key, i) => ({ ...key, live: i === 3 - keypad.keys.findIndex((k) => k.live) })) },
          { ...dial, waveform: { shape: "spike", peaks: 5, height: "half" } },
          { ...valve, coils: valve.coils === 2 ? 4 : 2, gauge: { start: MAX_PRESSURE - 1, rise: 2, vent: 3 } },
        ],
      }
    : {
        edgework: { serial: "XX0XX0" },
        modules: [
          { ...wires, wires: wires.wires.map((wire) => ({ ...wire, color: "green" })) },
          { ...keypad, keys: keypad.keys.map((key) => ({ ...key, glyph: { frame: "arch", mark: "dot" } })) },
          dial,
          { ...valve, handle: valve.handle === "red" ? "blue" : "red" },
        ],
      }
}

describe("viewFor", () => {
  it("shows the Operator colors, glyphs, the handle, progress and the serial, but no tags, live key, waveform, gauge or manual", () => {
    const view = viewFor(bomb, state, "operator")
    assert(Schema.is(OperatorView)(view))
    expect(view.serial).toBe(bomb.edgework.serial)
    expect(keysOf(view)).toEqual(
      new Set([
        ...["role", "serial", "modules", "kind", "solved", "wires", "color", "cut", "keys", "glyph", "frame", "mark", "pressed"],
        ...["handle", "held"],
      ]),
    )
    expect(view.modules).toEqual([
      { kind: "wires", solved: false, wires: wiresModule.wires.map(({ color }, i) => ({ color, cut: i === 1 })) },
      { kind: "keypad", solved: false, keys: keypadModule.keys.map(({ glyph }, i) => ({ glyph, pressed: i === 2 })) },
      { kind: "dial", solved: true },
      { kind: "valve", solved: false, handle: valveModule.handle, held: true },
    ])
  })

  it("shows the Scanner tags, the live key, the waveform, the coils and the gauge, but no colors, glyphs, handle, serial or manual", () => {
    const view = viewFor(bomb, state, "scanner")
    assert(Schema.is(ScannerView)(view))
    expect(keysOf(view)).toEqual(
      new Set([
        ...["role", "modules", "kind", "solved", "wires", "tag", "letter", "digit", "cut", "keys", "live", "pressed"],
        ...["waveform", "shape", "peaks", "height"],
        ...["coils", "gauge", "start", "rise", "vent", "since", "events", "at"],
      ]),
    )
    expect(view.modules).toEqual([
      { kind: "wires", solved: false, wires: wiresModule.wires.map(({ tag }, i) => ({ tag, cut: i === 1 })) },
      { kind: "keypad", solved: false, keys: keypadModule.keys.map(({ live }, i) => ({ live, pressed: i === 2 })) },
      { kind: "dial", solved: true, waveform: dialModule.waveform },
      { kind: "valve", solved: false, coils: valveModule.coils, gauge: valveModule.gauge, since: 1_000, events: valveEvents },
    ])
  })

  it("shows the Analyst the manual and module progress, but nothing of the bomb itself", () => {
    const view = viewFor(bomb, state, "analyst")
    assert(Schema.is(AnalystView)(view))
    expect(view.modules).toEqual([
      { kind: "wires", solved: false },
      { kind: "keypad", solved: false },
      { kind: "dial", solved: true },
      { kind: "valve", solved: false },
    ])
    expect(view.manual.map((section) => section.title)).toEqual(["wires.title", "keypad.title", "dial.title", "valve.title"])
    expect(keysOf(view.modules)).toEqual(new Set(["kind", "solved"]))
  })

  it("gives each role the same view whatever the bomb hides from them", () => {
    expect(viewFor(withHidden(bomb, "operator"), state, "operator")).toEqual(viewFor(bomb, state, "operator"))
    expect(viewFor(withHidden(bomb, "scanner"), state, "scanner")).toEqual(viewFor(bomb, state, "scanner"))
    const fresh = initialState(bomb, { startedAt: 1_000 })
    expect(viewFor(generateBomb(12, "easy"), fresh, "analyst")).toEqual(viewFor(bomb, fresh, "analyst"))
  })
})
