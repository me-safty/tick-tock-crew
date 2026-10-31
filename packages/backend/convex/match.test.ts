import { afterEach, describe, expect, test, vi } from "vitest"
import { internal } from "./_generated/api"
import { setup, startedMatch } from "./test.setup"

afterEach(() => {
  vi.useRealTimers()
})

const getRoom = (t: Awaited<ReturnType<typeof setup>>["t"]) => t.run((ctx) => ctx.db.query("rooms").first())

describe("explode", () => {
  test("loses the match when the timer runs out", async () => {
    vi.useFakeTimers()
    const { t } = await startedMatch()

    vi.advanceTimersByTime(5 * 60_000 - 1)
    expect(await getRoom(t)).toMatchObject({ status: "playing" })
    vi.advanceTimersByTime(1)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await getRoom(t)).toMatchObject({ status: "lost", strikes: 0 })
    expect(await getRoom(t)).not.toHaveProperty("explodeJobId")
  })

  test("does nothing unless the match is still playing", async () => {
    const { t } = await setup()
    const room = await getRoom(t)
    if (!room) throw new Error("no room")
    await t.mutation(internal.match.explode, { roomId: room._id })
    expect(await getRoom(t)).toMatchObject({ status: "lobby" })
  })
})
