import { generateBomb, solveWires } from "@tick-tock-crew/rules"
import { Option } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { api, internal } from "./_generated/api"
import { PLAYERS, setup, startedMatch, type T } from "./test.setup"

afterEach(() => {
  vi.useRealTimers()
})

const [operator, analyst, scanner] = PLAYERS

const getRoom = (t: T) => t.run((ctx) => ctx.db.query("rooms").first())

async function bombOf(t: T) {
  const room = await getRoom(t)
  if (room?.status !== "playing") throw new Error("expected a playing room")
  const bomb = generateBomb(room.seed, room.difficulty)
  const wires = bomb.modules[0].wires
  const answer = Option.getOrThrow(solveWires(bomb.edgework.serial, wires))
  const wrong = wires.map((_, index) => index).filter((index) => index !== answer)
  return { room, bomb, answer, wrong }
}

const cut = (t: T, code: string, wire: number, sessionId: string = operator.sessionId) =>
  t.mutation(api.match.cutWire, { code, sessionId, module: 0, wire })

const jobState = (t: T, room: Awaited<ReturnType<typeof bombOf>>["room"]) =>
  t.run(async (ctx) => (await ctx.db.system.get("_scheduled_functions", room.explodeJobId))?.state.kind)

describe("cutWire", () => {
  test("wins the match on the right wire and cancels the explosion", async () => {
    const { t, code } = await startedMatch()
    const { room, answer } = await bombOf(t)

    expect(await cut(t, code, answer)).toBe("solved")
    expect(await getRoom(t)).toMatchObject({ status: "won", strikes: 0 })
    expect(await t.run((ctx) => ctx.db.query("modules").first())).toMatchObject({ solved: true, progress: { cut: [answer] } })
    expect(await jobState(t, room)).toBe("canceled")
  })

  test("adds a strike on a wrong wire", async () => {
    const { t, code } = await startedMatch()
    const { wrong } = await bombOf(t)

    expect(await cut(t, code, wrong[0] ?? -1)).toBe("strike")
    expect(await getRoom(t)).toMatchObject({ status: "playing", strikes: 1 })
    await expect(cut(t, code, wrong[0] ?? -1)).rejects.toThrow("That wire is already cut")
    expect(await getRoom(t)).toMatchObject({ strikes: 1 })
  })

  test("loses the match on the third strike and then rejects cuts", async () => {
    const { t, code } = await startedMatch()
    const { room, answer, wrong } = await bombOf(t)

    for (const wire of wrong.slice(0, 3)) await cut(t, code, wire)
    expect(await getRoom(t)).toMatchObject({ status: "lost", strikes: 3 })
    expect(await jobState(t, room)).toBe("canceled")
    await expect(cut(t, code, answer)).rejects.toThrow("The match is over")
  })

  test("only lets the Operator cut", async () => {
    const { t, code } = await startedMatch()
    const { answer } = await bombOf(t)

    for (const sessionId of [analyst.sessionId, scanner.sessionId, "stranger"]) {
      await expect(cut(t, code, answer, sessionId)).rejects.toThrow("Only the Operator can cut wires")
    }
    expect(await getRoom(t)).toMatchObject({ status: "playing", strikes: 0 })
  })

  test("rejects cuts once time is up, even before the explosion runs", async () => {
    vi.useFakeTimers()
    const { t, code } = await startedMatch()
    const { room, answer } = await bombOf(t)

    vi.setSystemTime(room.endsAt)
    await expect(cut(t, code, answer)).rejects.toThrow("Time is up")
  })
})

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
    if (!room) throw new Error("expected a room")
    await t.mutation(internal.match.explode, { roomId: room._id })
    expect(await getRoom(t)).toMatchObject({ status: "lobby" })
  })
})

describe("view", () => {
  const viewOf = (t: T, code: string, sessionId: string) => t.query(api.match.view, { code, sessionId })

  test("gives each seat only its own role's slice of the bomb", async () => {
    const { t, code } = await startedMatch()
    const { bomb, wrong } = await bombOf(t)
    await cut(t, code, wrong[0] ?? -1)
    const { serial } = bomb.edgework
    const { wires } = bomb.modules[0]

    const operatorView = await viewOf(t, code, operator.sessionId)
    expect(operatorView).toMatchObject({ status: "playing", strikes: 1, view: { role: "operator", serial } })
    expect(operatorView?.view).toEqual({
      role: "operator",
      serial,
      modules: [{ kind: "wires", solved: false, wires: wires.map(({ color }, i) => ({ color, cut: i === wrong[0] })) }],
    })

    const scannerView = await viewOf(t, code, scanner.sessionId)
    expect(scannerView?.view).toEqual({
      role: "scanner",
      modules: [{ kind: "wires", solved: false, wires: wires.map(({ tag }, i) => ({ tag, cut: i === wrong[0] })) }],
    })

    const analystView = await viewOf(t, code, analyst.sessionId)
    expect(analystView?.view).toMatchObject({ role: "analyst", modules: [{ kind: "wires", solved: false }] })
    const analystJson = JSON.stringify(analystView)
    expect(analystJson).not.toContain(serial)
    expect(analystJson).not.toContain('"wires":[')
    expect(analystJson).not.toContain('"tag"')
  })

  test("shows the timer but no bomb to someone without a seat", async () => {
    const { t, code } = await startedMatch()
    expect(await viewOf(t, code, "stranger")).toMatchObject({ status: "playing", view: null })
  })

  test("returns nothing before the match starts", async () => {
    const { t, code } = await setup()
    expect(await viewOf(t, code, operator.sessionId)).toBeNull()
  })
})
