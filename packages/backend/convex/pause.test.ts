import { burstAt, generateBomb, pressureAt } from "@tick-tock-crew/rules"
import { afterEach, describe, expect, test, vi } from "vitest"
import { api } from "./_generated/api"
import { PAUSE_GRACE_MS } from "./pause"
import { goOnline, PLAYERS, startedMatch, type T } from "./test.setup"

afterEach(() => {
  vi.useRealTimers()
})

const [operator, , scanner] = PLAYERS
const VALVE = 3
const WAIT_MS = 60_000
// convex-test fires a scheduled job a moment after its due time, not on it.
const SLACK_MS = 100

const getRoom = (t: T) => t.run((ctx) => ctx.db.query("rooms").first())
const valveDoc = (t: T) => t.run(async (ctx) => (await ctx.db.query("modules").collect()).find((doc) => doc.index === VALVE))

async function drop(t: T, code: string, sessionId: string) {
  const { sessionToken } = await goOnline(t, code, sessionId)
  await t.mutation(api.presence.disconnect, { sessionToken })
}

/** Everyone heartbeats again, as their open tabs do; the Scanner's is the one that was missing. */
async function allBack(t: T, code: string) {
  for (const player of PLAYERS) await goOnline(t, code, player.sessionId)
}

async function runJobs(t: T, ms: number) {
  vi.advanceTimersByTime(ms)
  await t.finishInProgressScheduledFunctions()
}

/** A match whose Scanner dropped and stayed away past the grace period. */
async function pausedMatch() {
  vi.useFakeTimers()
  const { t, code } = await startedMatch()
  const playing = await getRoom(t)
  if (playing?.status !== "playing") throw new Error("expected a playing room")
  await drop(t, code, scanner.sessionId)
  await t.mutation(api.pause.reportAbsence, { code })
  await runJobs(t, PAUSE_GRACE_MS + SLACK_MS)
  return { t, code, playing }
}

describe("pause on disconnect", () => {
  test("waits out the grace period, then stops the clock and cancels the explosion", async () => {
    vi.useFakeTimers()
    const { t, code } = await startedMatch()
    await drop(t, code, scanner.sessionId)
    await t.mutation(api.pause.reportAbsence, { code })
    await runJobs(t, PAUSE_GRACE_MS - SLACK_MS)
    expect((await getRoom(t))?.status).toBe("playing")

    await runJobs(t, 2 * SLACK_MS)
    const room = await getRoom(t)
    expect(room).toMatchObject({ status: "paused", pausedAt: Date.now() })
    const match = await t.query(api.match.view, { code, sessionId: operator.sessionId })
    expect(match).toMatchObject({ status: "paused", pausedAt: Date.now() })
  })

  test("doesn't pause for a player back within the grace period, as after a reload", async () => {
    vi.useFakeTimers()
    const { t, code } = await startedMatch()
    await drop(t, code, scanner.sessionId)
    await t.mutation(api.pause.reportAbsence, { code })
    await runJobs(t, PAUSE_GRACE_MS / 2)
    await goOnline(t, code, scanner.sessionId)
    await runJobs(t, PAUSE_GRACE_MS)
    expect((await getRoom(t))?.status).toBe("playing")
  })

  test("refuses the Operator's actions while paused", async () => {
    const { t, code } = await pausedMatch()
    await expect(t.mutation(api.match.cutWire, { code, sessionId: operator.sessionId, module: 0, wire: 0 })).rejects.toMatchObject({
      data: { code: "MATCH_PAUSED" },
    })
    await expect(t.mutation(api.match.holdValve, { code, sessionId: operator.sessionId, module: VALVE })).rejects.toMatchObject({
      data: { code: "MATCH_PAUSED" },
    })
  })

  test("never explodes while paused, and moves the deadline on by the wait when the player returns", async () => {
    const { t, code, playing } = await pausedMatch()
    const paused = await getRoom(t)
    if (paused?.status !== "paused") throw new Error("expected a paused room")
    await runJobs(t, playing.endsAt - Date.now() + WAIT_MS)
    expect((await getRoom(t))?.status).toBe("paused")

    await allBack(t, code)
    const resumed = await getRoom(t)
    if (resumed?.status !== "playing") throw new Error("expected the match to resume")
    // convex-test's clock may tick a millisecond or so inside a mutation.
    expect(Math.abs(resumed.endsAt - playing.endsAt - (Date.now() - paused.pausedAt))).toBeLessThan(SLACK_MS)
  })

  test("seals a held valve at the pause and picks the needle up where it stopped", async () => {
    vi.useFakeTimers()
    const { t, code } = await startedMatch()
    const room = await getRoom(t)
    if (room?.status !== "playing") throw new Error("expected a playing room")
    const { gauge } = generateBomb(room.seed, room.difficulty).modules[VALVE]
    await t.mutation(api.match.holdValve, { code, sessionId: operator.sessionId, module: VALVE })
    vi.advanceTimersByTime(2_000)
    await drop(t, code, scanner.sessionId)
    await t.mutation(api.pause.reportAbsence, { code })
    await runJobs(t, PAUSE_GRACE_MS + SLACK_MS)

    const paused = await getRoom(t)
    const atPause = await valveDoc(t)
    if (paused?.status !== "paused" || atPause?.kind !== "valve") throw new Error("expected a paused valve")
    expect(atPause.progress.events.at(-1)).toEqual({ kind: "release", at: paused.pausedAt })
    const pressure = pressureAt(gauge, atPause.progress, paused.pausedAt)

    await runJobs(t, WAIT_MS)
    await allBack(t, code)
    const resumed = await getRoom(t)
    const afterResume = await valveDoc(t)
    if (resumed?.status !== "playing" || afterResume?.kind !== "valve") throw new Error("expected the valve back in play")
    const waited = resumed.endsAt - paused.endsAt
    expect(pressureAt(gauge, afterResume.progress, paused.pausedAt + waited)).toBeCloseTo(pressure)
    const due = burstAt(gauge, afterResume.progress)
    expect(due).toBe((burstAt(gauge, atPause.progress) ?? 0) + waited)
    const bursts = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) => job.name.includes("burstValve") && job.state.kind === "pending" && job.scheduledTime === due,
      ),
    )
    expect(bursts).toHaveLength(1)
  })

  test("resumes when someone takes over the empty seat", async () => {
    const { t, code } = await pausedMatch()
    await goOnline(t, code, "d")
    await expect(
      t.mutation(api.pause.takeOverSeat, { code, sessionId: operator.sessionId, name: "Hana", role: "scanner" }),
    ).rejects.toMatchObject({ data: { code: "ALREADY_SEATED" } })
    await expect(t.mutation(api.pause.takeOverSeat, { code, sessionId: "d", name: "Dee", role: "operator" })).rejects.toMatchObject({
      data: { code: "SEAT_TAKEN" },
    })

    await t.mutation(api.pause.takeOverSeat, { code, sessionId: "d", name: "Dee", role: "scanner" })
    expect((await getRoom(t))?.status).toBe("playing")
    const lobby = await t.query(api.rooms.lobby, { code, sessionId: "d" })
    expect(lobby?.seats[2]?.player).toMatchObject({ name: "Dee", isYou: true, online: true })
  })
})
