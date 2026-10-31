import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { generateBomb } from "./bomb"
import { cutWire, initialState, type MatchState, matchStatus } from "./match"
import { solveWires } from "./wires"

const bomb = generateBomb(7, "normal")
const wires = bomb.modules[0].wires
const answer = Option.getOrThrow(solveWires(bomb.edgework.serial, wires))
const wrong = wires.map((_, index) => index).filter((index) => index !== answer)

const cut = (state: MatchState, wire: number) => cutWire(bomb, state, { module: 0, wire })

describe("cutWire", () => {
  it.effect("solves the module and wins the match on the right wire", () =>
    Effect.gen(function* () {
      const outcome = yield* cut(initialState(bomb), answer)
      expect(outcome.kind).toBe("solved")
      expect(outcome.state).toEqual({ strikes: 0, modules: [{ kind: "wires", solved: true, progress: { cut: [answer] } }] })
      expect(matchStatus(outcome.state)).toBe("won")
    }),
  )

  it.effect("adds a strike on a wrong wire and keeps playing", () =>
    Effect.gen(function* () {
      const outcome = yield* cut(initialState(bomb), wrong[0] ?? -1)
      expect(outcome.kind).toBe("strike")
      expect(outcome.state.strikes).toBe(1)
      expect(outcome.state.modules[0]?.solved).toBe(false)
      expect(matchStatus(outcome.state)).toBe("playing")
    }),
  )

  it.effect("loses the match on the third strike, then rejects every cut", () =>
    Effect.gen(function* () {
      let state = initialState(bomb)
      for (const wire of wrong.slice(0, 3)) state = (yield* cut(state, wire)).state
      expect(state.strikes).toBe(3)
      expect(matchStatus(state)).toBe("lost")
      expect((yield* Effect.flip(cut(state, answer)))._tag).toBe("MatchOver")
    }),
  )

  it.effect("rejects a wire that is already cut, without a strike", () =>
    Effect.gen(function* () {
      const { state } = yield* cut(initialState(bomb), wrong[0] ?? -1)
      const error = yield* Effect.flip(cut(state, wrong[0] ?? -1))
      expect(error._tag).toBe("WireAlreadyCut")
    }),
  )

  it.effect("rejects modules and wires that don't exist", () =>
    Effect.gen(function* () {
      const state = initialState(bomb)
      expect((yield* Effect.flip(cutWire(bomb, state, { module: 1, wire: 0 })))._tag).toBe("ModuleNotFound")
      for (const wire of [-1, wires.length, 0.5]) {
        expect((yield* Effect.flip(cut(state, wire)))._tag).toBe("WireNotFound")
      }
    }),
  )
})
