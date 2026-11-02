import { afterEach, describe, expect, test, vi } from "vitest"
import { api } from "./_generated/api"
import { MAX_ACTIVE_PINGS, PING_MS } from "./pings"
import { PLAYERS, seatAll, setup, startedMatch, type T } from "./test.setup"

afterEach(() => {
  vi.useRealTimers()
})

const [operator, analyst, scanner] = PLAYERS
const WIRES = 0
const KEYPAD = 1

const list = (t: T, code: string, sessionId: string) => t.query(api.pings.list, { code, sessionId })

describe("point", () => {
  test("a wire ping from the Operator reaches every seat as a bare target ref", async () => {
    const { t, code } = await startedMatch()
    await t.mutation(api.pings.point, { code, sessionId: operator.sessionId, target: { kind: "wire", module: WIRES, wire: 1 } })

    for (const { sessionId } of PLAYERS) {
      const pings = await list(t, code, sessionId)
      expect(pings.map(({ fromRole, ping }) => ({ fromRole, ping }))).toEqual([
        { fromRole: "operator", ping: { kind: "wire", module: WIRES, wire: 1 } },
      ])
    }
  })

  test("never carries a color or tag to the Analyst", async () => {
    const { t, code } = await startedMatch()
    await t.mutation(api.pings.point, { code, sessionId: scanner.sessionId, target: { kind: "key", module: KEYPAD, key: 2 } })
    await t.mutation(api.pings.point, { code, sessionId: operator.sessionId, target: { kind: "wire", module: WIRES, wire: 0 } })

    const [first, second] = await list(t, code, analyst.sessionId)
    expect(Object.keys(first?.ping ?? {}).sort()).toEqual(["key", "kind", "module"])
    expect(Object.keys(second?.ping ?? {}).sort()).toEqual(["kind", "module", "wire"])
    await expect(
      t.mutation(api.pings.point, {
        code,
        sessionId: operator.sessionId,
        // @ts-expect-error A ping can't smuggle what the pinger sees.
        target: { kind: "wire", module: WIRES, wire: 0, color: "red" },
      }),
    ).rejects.toThrow()
  })

  test("the Analyst points at manual sections only, the others at the bomb only", async () => {
    const { t, code } = await startedMatch()
    await t.mutation(api.pings.point, { code, sessionId: analyst.sessionId, target: { kind: "manual", section: "valve" } })
    await expect(
      t.mutation(api.pings.point, { code, sessionId: analyst.sessionId, target: { kind: "module", module: WIRES } }),
    ).rejects.toMatchObject({ data: { code: "PING_NOT_ALLOWED" } })
    await expect(
      t.mutation(api.pings.point, { code, sessionId: scanner.sessionId, target: { kind: "manual", section: "wires" } }),
    ).rejects.toMatchObject({ data: { code: "PING_NOT_ALLOWED" } })
    expect((await list(t, code, operator.sessionId)).map((ping) => ping.ping)).toEqual([{ kind: "manual", section: "valve" }])
  })

  test.each([
    { kind: "module", module: 9 },
    { kind: "wire", module: WIRES, wire: 99 },
    { kind: "wire", module: KEYPAD, wire: 0 },
    { kind: "key", module: KEYPAD, key: -1 },
    { kind: "key", module: WIRES, key: 0 },
  ] as const)("rejects a target the bomb doesn't have: %o", async (target) => {
    const { t, code } = await startedMatch()
    await expect(t.mutation(api.pings.point, { code, sessionId: operator.sessionId, target })).rejects.toMatchObject({
      data: { code: "PING_TARGET_NOT_FOUND" },
    })
  })

  test("needs a seat and a match in play", async () => {
    const { t, code } = await setup()
    await seatAll(t, code, false)
    const target = { kind: "module", module: WIRES } as const
    await expect(t.mutation(api.pings.point, { code, sessionId: operator.sessionId, target })).rejects.toMatchObject({
      data: { code: "MATCH_OVER" },
    })
    await expect(t.mutation(api.pings.point, { code, sessionId: "stranger", target })).rejects.toMatchObject({
      data: { code: "SEAT_REQUIRED" },
    })
    expect(await list(t, code, "stranger")).toEqual([])
  })
})

describe("emote", () => {
  test("works in the lobby and shows for every seat", async () => {
    const { t, code } = await setup()
    await seatAll(t, code, false)
    await t.mutation(api.pings.emote, { code, sessionId: scanner.sessionId, emote: "hurry" })
    expect((await list(t, code, analyst.sessionId)).map(({ fromRole, ping }) => ({ fromRole, ping }))).toEqual([
      { fromRole: "scanner", ping: { kind: "emote", emote: "hurry" } },
    ])
  })
})

describe("rate limit and expiry", () => {
  test("a seat gets a few live pings at once, and another once the oldest expires", async () => {
    vi.useFakeTimers()
    const { t, code } = await startedMatch()
    const target = { kind: "module", module: WIRES } as const
    for (let i = 0; i < MAX_ACTIVE_PINGS; i++) {
      await t.mutation(api.pings.emote, { code, sessionId: operator.sessionId, emote: "wait" })
    }
    await expect(t.mutation(api.pings.point, { code, sessionId: operator.sessionId, target })).rejects.toMatchObject({
      data: { code: "TOO_MANY_PINGS" },
    })
    // Another seat has its own allowance.
    await t.mutation(api.pings.point, { code, sessionId: scanner.sessionId, target })

    // The server's clock can run a millisecond ahead of the fake one.
    vi.advanceTimersByTime(PING_MS + 10)
    await t.finishInProgressScheduledFunctions()
    expect(await list(t, code, operator.sessionId)).toEqual([])
    await t.mutation(api.pings.emote, { code, sessionId: operator.sessionId, emote: "nice" })
    expect(await list(t, code, operator.sessionId)).toHaveLength(1)
  })
})
