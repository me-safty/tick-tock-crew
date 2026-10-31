import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

test("health returns ok", async () => {
  const t = convexTest(schema, modules)
  expect(await t.query(api.health.health, {})).toBe("ok")
})
