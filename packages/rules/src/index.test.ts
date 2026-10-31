import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { status } from "./index"

it.effect("status succeeds with ok", () =>
  Effect.gen(function* () {
    expect(yield* status).toBe("ok")
  }),
)
