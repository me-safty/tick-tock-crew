import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { generateBomb } from "./bomb"
import { solveDial } from "./dial"
import { solveKeypad } from "./keypad"
import {
  burstValve,
  cutWire,
  holdValve,
  initialState,
  type MatchState,
  matchStatus,
  pressKey,
  releaseValve,
  tuneDial,
} from "./match"
import { burstAt, RELEASE_GRACE_MS, solveValve } from "./valve"
import { solveWires } from "./wires"

const bomb = generateBomb(7, "normal")
const { serial } = bomb.edgework
const [wiresModule, keypadModule, dialModule, valveModule] = bomb.modules
const answer = Option.getOrThrow(solveWires(serial, wiresModule.wires))
const wrong = wiresModule.wires.map((_, index) => index).filter((index) => index !== answer)
const presses = Option.getOrThrow(solveKeypad(serial, keypadModule.keys))
const frequency = solveDial(serial, dialModule.waveform)

const WIRES = 0
const KEYPAD = 1
const DIAL = 2
const VALVE = 3

const STARTED = 1_000_000
const fresh = () => initialState(bomb, { startedAt: STARTED })
const band = solveValve(valveModule)
/** Ms after the start when a valve held from the start reads `pressure`. */
const ventedTo = (pressure: number) => ((valveModule.gauge.start - pressure) / valveModule.gauge.vent) * 1000

const cut = (state: MatchState, wire: number) => cutWire(bomb, state, { module: WIRES, wire })
const press = (state: MatchState, key: number) => pressKey(bomb, state, { module: KEYPAD, key })
const tune = (state: MatchState, to: number) => tuneDial(bomb, state, { module: DIAL, frequency: to })
const hold = (state: MatchState, afterMs = 0) => holdValve(bomb, state, { module: VALVE, at: STARTED + afterMs })
const release = (state: MatchState, afterMs: number) => releaseValve(bomb, state, { module: VALVE, at: STARTED + afterMs })
/** Holds from the start and lets go `afterMs` later. */
const vent = (state: MatchState, afterMs: number) =>
  Effect.flatMap(hold(state), ({ state: held }) => release(held, afterMs))

describe("cutWire", () => {
  it.effect("solves the wires on the right wire, but the match goes on", () =>
    Effect.gen(function* () {
      const outcome = yield* cut(fresh(), answer)
      expect(outcome.kind).toBe("solved")
      expect(outcome.state.strikes).toBe(0)
      expect(outcome.state.modules[WIRES]).toEqual({ kind: "wires", solved: true, progress: { cut: [answer] } })
      expect(matchStatus(outcome.state)).toBe("playing")
    }),
  )

  it.effect("adds a strike on a wrong wire and keeps playing", () =>
    Effect.gen(function* () {
      const outcome = yield* cut(fresh(), wrong[0] ?? -1)
      expect(outcome.kind).toBe("strike")
      expect(outcome.state.strikes).toBe(1)
      expect(outcome.state.modules[WIRES]?.solved).toBe(false)
      expect(matchStatus(outcome.state)).toBe("playing")
    }),
  )

  it.effect("loses the match on the third strike, then rejects every action", () =>
    Effect.gen(function* () {
      let state = fresh()
      for (const wire of wrong.slice(0, 3)) state = (yield* cut(state, wire)).state
      expect(state.strikes).toBe(3)
      expect(matchStatus(state)).toBe("lost")
      expect((yield* Effect.flip(cut(state, answer)))._tag).toBe("MatchOver")
      expect((yield* Effect.flip(press(state, presses[0] ?? -1)))._tag).toBe("MatchOver")
      expect((yield* Effect.flip(tune(state, frequency)))._tag).toBe("MatchOver")
      expect((yield* Effect.flip(hold(state)))._tag).toBe("MatchOver")
    }),
  )

  it.effect("rejects a wire that is already cut, without a strike", () =>
    Effect.gen(function* () {
      const { state } = yield* cut(fresh(), wrong[0] ?? -1)
      const error = yield* Effect.flip(cut(state, wrong[0] ?? -1))
      expect(error._tag).toBe("WireAlreadyCut")
    }),
  )

  it.effect("rejects modules and wires that don't exist", () =>
    Effect.gen(function* () {
      const state = fresh()
      expect((yield* Effect.flip(cutWire(bomb, state, { module: 4, wire: 0 })))._tag).toBe("ModuleNotFound")
      expect((yield* Effect.flip(cutWire(bomb, state, { module: KEYPAD, wire: 0 })))._tag).toBe("ModuleNotFound")
      for (const wire of [-1, wiresModule.wires.length, 0.5]) {
        expect((yield* Effect.flip(cut(state, wire)))._tag).toBe("WireNotFound")
      }
    }),
  )
})

describe("pressKey", () => {
  it.effect("accepts each right key in turn and solves the keypad on the last", () =>
    Effect.gen(function* () {
      let state = fresh()
      for (const [step, key] of presses.entries()) {
        const outcome = yield* press(state, key)
        const last = step === presses.length - 1
        expect(outcome.kind).toBe(last ? "solved" : "accepted")
        expect(outcome.state.modules[KEYPAD]).toEqual({
          kind: "keypad",
          solved: last,
          progress: { pressed: presses.slice(0, step + 1) },
        })
        state = outcome.state
      }
      expect(state.strikes).toBe(0)
      expect((yield* Effect.flip(press(state, presses[0] ?? -1)))._tag).toBe("ModuleAlreadySolved")
    }),
  )

  it.effect("strikes on a key out of order and keeps the presses so far", () =>
    Effect.gen(function* () {
      const first = yield* press(fresh(), presses[0] ?? -1)
      const outcome = yield* press(first.state, presses[2] ?? -1)
      expect(outcome.kind).toBe("strike")
      expect(outcome.state.strikes).toBe(1)
      expect(outcome.state.modules[KEYPAD]).toEqual({ kind: "keypad", solved: false, progress: { pressed: [presses[0]] } })
      expect((yield* press(outcome.state, presses[1] ?? -1)).kind).toBe("accepted")
    }),
  )

  it.effect("rejects a key already pressed, keys that don't exist and other modules, without a strike", () =>
    Effect.gen(function* () {
      const { state } = yield* press(fresh(), presses[0] ?? -1)
      expect((yield* Effect.flip(press(state, presses[0] ?? -1)))._tag).toBe("KeyAlreadyPressed")
      for (const key of [-1, 4, 1.5]) expect((yield* Effect.flip(press(state, key)))._tag).toBe("KeyNotFound")
      expect((yield* Effect.flip(pressKey(bomb, state, { module: DIAL, key: 0 })))._tag).toBe("ModuleNotFound")
    }),
  )
})

describe("tuneDial", () => {
  it.effect("solves the dial on the right frequency", () =>
    Effect.gen(function* () {
      const outcome = yield* tune(fresh(), frequency)
      expect(outcome.kind).toBe("solved")
      expect(outcome.state).toMatchObject({ strikes: 0, modules: { [DIAL]: { kind: "dial", solved: true } } })
    }),
  )

  it.effect("strikes on any other frequency on the dial", () =>
    Effect.gen(function* () {
      const outcome = yield* tune(fresh(), frequency + 1)
      expect(outcome.kind).toBe("strike")
      expect(outcome.state).toMatchObject({ strikes: 1, modules: { [DIAL]: { kind: "dial", solved: false } } })
    }),
  )

  it.effect("rejects frequencies the dial can't show, without a strike", () =>
    Effect.gen(function* () {
      for (const to of [9, 100, 42.5, Number.NaN]) {
        expect((yield* Effect.flip(tune(fresh(), to)))._tag).toBe("FrequencyOffDial")
      }
    }),
  )
})

describe("pressure valve", () => {
  it.effect("solves when let go inside the band", () =>
    Effect.gen(function* () {
      const at = ventedTo((band.low + band.high) / 2)
      const outcome = yield* vent(fresh(), at)
      expect(outcome.kind).toBe("solved")
      expect(outcome.state.strikes).toBe(0)
      expect(outcome.state.modules[VALVE]).toEqual({
        kind: "valve",
        solved: true,
        progress: { since: STARTED, events: [{ kind: "hold", at: STARTED }, { kind: "release", at: STARTED + at }] },
      })
      expect((yield* Effect.flip(hold(outcome.state, at + 1)))._tag).toBe("ModuleAlreadySolved")
    }),
  )

  it.effect("strikes when let go outside the band, and puts the needle back at its start", () =>
    Effect.gen(function* () {
      const early = ventedTo(band.high) - RELEASE_GRACE_MS - 1
      const late = ventedTo(band.low) + RELEASE_GRACE_MS + 1
      for (const at of [early, late]) {
        const outcome = yield* vent(fresh(), at)
        expect(outcome.kind).toBe("strike")
        expect(outcome.state.strikes).toBe(1)
        expect(outcome.state.modules[VALVE]).toMatchObject({
          solved: false,
          progress: { events: [{ kind: "hold" }, { kind: "release", at: STARTED + at }, { kind: "reset", at: STARTED + at }] },
        })
      }
    }),
  )

  it.effect("accepts a release a quarter second of venting past either end of the band", () =>
    Effect.gen(function* () {
      expect((yield* vent(fresh(), ventedTo(band.high) - RELEASE_GRACE_MS + 1)).kind).toBe("solved")
      expect((yield* vent(fresh(), ventedTo(band.low) + RELEASE_GRACE_MS - 1)).kind).toBe("solved")
    }),
  )

  it.effect("ignores a second hold, rejects letting go of a sealed valve, and keeps events in order", () =>
    Effect.gen(function* () {
      expect((yield* Effect.flip(release(fresh(), 1_000)))._tag).toBe("ValveNotHeld")
      const { state } = yield* hold(fresh(), 1_000)
      expect((yield* hold(state, 2_000)).state).toBe(state)
      const late = yield* release(state, 500)
      const stamp = { at: STARTED + 1_000 }
      expect(late.state.modules[VALVE]).toMatchObject({ progress: { events: [stamp, stamp, stamp] } })
      expect((yield* Effect.flip(holdValve(bomb, state, { module: DIAL, at: STARTED })))._tag).toBe("ModuleNotFound")
    }),
  )

  it.effect("bursts with a strike once the needle tops out, and never while held", () =>
    Effect.gen(function* () {
      const due = burstAt(valveModule.gauge, { since: STARTED, events: [] }) ?? 0
      expect((yield* burstValve(bomb, fresh(), { module: VALVE, at: due - 1 })).kind).toBe("steady")
      const burst = yield* burstValve(bomb, fresh(), { module: VALVE, at: due })
      expect(burst.kind).toBe("burst")
      expect(burst.state.strikes).toBe(1)
      expect(burst.state.modules[VALVE]).toMatchObject({ solved: false, progress: { events: [{ kind: "reset", at: due }] } })

      const { state: held } = yield* hold(fresh(), 1_000)
      expect((yield* burstValve(bomb, held, { module: VALVE, at: due * 2 })).kind).toBe("steady")
    }),
  )
})

describe("matchStatus", () => {
  it.effect("wins only once wires, keypad, dial and valve are all solved", () =>
    Effect.gen(function* () {
      let state = (yield* cut(fresh(), answer)).state
      for (const key of presses) state = (yield* press(state, key)).state
      state = (yield* tune(state, frequency)).state
      expect(matchStatus(state)).toBe("playing")
      state = (yield* vent(state, ventedTo((band.low + band.high) / 2))).state
      expect(matchStatus(state)).toBe("won")
    }),
  )
})
