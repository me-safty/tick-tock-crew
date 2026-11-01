import { generateBomb, solveDial, solveKeypad, solveWires } from "@tick-tock-crew/rules"
import { Option } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { api, internal } from "./_generated/api"
import { PLAYERS, setup, startedMatch, type T } from "./test.setup"

afterEach(() => {
  vi.useRealTimers()
})

const [operator, analyst, scanner] = PLAYERS

const getRoom = (t: T) => t.run((ctx) => ctx.db.query("rooms").first())
const moduleDoc = (t: T, index: number) =>
  t.run(async (ctx) => (await ctx.db.query("modules").collect()).find((doc) => doc.index === index))

async function bombOf(t: T) {
  const room = await getRoom(t)
  if (room?.status !== "playing") throw new Error("expected a playing room")
  const bomb = generateBomb(room.seed, room.difficulty)
  const { serial } = bomb.edgework
  const [{ wires }, { keys }, { waveform }] = bomb.modules
  const answer = Option.getOrThrow(solveWires(serial, wires))
  const wrong = wires.map((_, index) => index).filter((index) => index !== answer)
  const presses = Option.getOrThrow(solveKeypad(serial, keys))
  return { room, bomb, answer, wrong, presses, frequency: solveDial(serial, waveform) }
}

const WIRES = 0
const KEYPAD = 1
const DIAL = 2

const cut = (t: T, code: string, wire: number, sessionId: string = operator.sessionId) =>
  t.mutation(api.match.cutWire, { code, sessionId, module: WIRES, wire })
const press = (t: T, code: string, key: number, sessionId: string = operator.sessionId) =>
  t.mutation(api.match.pressKey, { code, sessionId, module: KEYPAD, key })
const tune = (t: T, code: string, frequency: number, sessionId: string = operator.sessionId) =>
  t.mutation(api.match.tuneDial, { code, sessionId, module: DIAL, frequency })

const jobState = (t: T, room: Awaited<ReturnType<typeof bombOf>>["room"]) =>
  t.run(async (ctx) => (await ctx.db.system.get("_scheduled_functions", room.explodeJobId))?.state.kind)

describe("cutWire", () => {
  test("solves the wires on the right wire, with the match still on", async () => {
    const { t, code } = await startedMatch()
    const { answer } = await bombOf(t)

    expect(await cut(t, code, answer)).toBe("solved")
    expect(await getRoom(t)).toMatchObject({ status: "playing", strikes: 0 })
    expect(await moduleDoc(t, WIRES)).toMatchObject({ kind: "wires", solved: true, progress: { cut: [answer] } })
  })

  test("adds a strike on a wrong wire", async () => {
    const { t, code } = await startedMatch()
    const { wrong } = await bombOf(t)

    expect(await cut(t, code, wrong[0] ?? -1)).toBe("strike")
    expect(await getRoom(t)).toMatchObject({ status: "playing", strikes: 1 })
    await expect(cut(t, code, wrong[0] ?? -1)).rejects.toMatchObject({ data: { code: "WIRE_ALREADY_CUT" } })
    expect(await getRoom(t)).toMatchObject({ strikes: 1 })
  })

  test("loses the match on the third strike and then rejects every action", async () => {
    const { t, code } = await startedMatch()
    const { room, answer, wrong, presses, frequency } = await bombOf(t)

    for (const wire of wrong.slice(0, 2)) await cut(t, code, wire)
    expect(await tune(t, code, frequency + 1)).toBe("strike")
    expect(await getRoom(t)).toMatchObject({ status: "lost", strikes: 3 })
    expect(await jobState(t, room)).toBe("canceled")
    await expect(cut(t, code, answer)).rejects.toMatchObject({ data: { code: "MATCH_OVER" } })
    await expect(press(t, code, presses[0] ?? -1)).rejects.toMatchObject({ data: { code: "MATCH_OVER" } })
  })

  test("only lets the Operator act", async () => {
    const { t, code } = await startedMatch()
    const { answer, presses, frequency } = await bombOf(t)

    for (const sessionId of [analyst.sessionId, scanner.sessionId, "stranger"]) {
      const notOperator = { data: { code: "OPERATOR_ONLY" } }
      await expect(cut(t, code, answer, sessionId)).rejects.toMatchObject(notOperator)
      await expect(press(t, code, presses[0] ?? -1, sessionId)).rejects.toMatchObject(notOperator)
      await expect(tune(t, code, frequency, sessionId)).rejects.toMatchObject(notOperator)
    }
    expect(await getRoom(t)).toMatchObject({ status: "playing", strikes: 0 })
  })

  test("rejects actions once time is up, even before the explosion runs", async () => {
    vi.useFakeTimers()
    const { t, code } = await startedMatch()
    const { room, answer, frequency } = await bombOf(t)

    vi.setSystemTime(room.endsAt)
    await expect(cut(t, code, answer)).rejects.toMatchObject({ data: { code: "TIME_UP" } })
    await expect(tune(t, code, frequency)).rejects.toMatchObject({ data: { code: "TIME_UP" } })
  })
})

describe("pressKey", () => {
  test("accepts the keys in order, strikes on a wrong one, and solves the keypad", async () => {
    const { t, code } = await startedMatch()
    const { presses } = await bombOf(t)
    const [first = -1, second = -1, ...rest] = presses

    expect(await press(t, code, first)).toBe("accepted")
    expect(await press(t, code, rest[0] ?? -1)).toBe("strike")
    expect(await getRoom(t)).toMatchObject({ status: "playing", strikes: 1 })
    expect(await moduleDoc(t, KEYPAD)).toMatchObject({ solved: false, progress: { pressed: [first] } })

    await expect(press(t, code, first)).rejects.toMatchObject({ data: { code: "KEY_ALREADY_PRESSED" } })
    await expect(press(t, code, 4)).rejects.toMatchObject({ data: { code: "KEY_NOT_FOUND" } })
    for (const key of [second, ...rest.slice(0, -1)]) expect(await press(t, code, key)).toBe("accepted")
    expect(await press(t, code, rest.at(-1) ?? -1)).toBe("solved")
    expect(await moduleDoc(t, KEYPAD)).toMatchObject({ solved: true, progress: { pressed: presses } })
    expect(await getRoom(t)).toMatchObject({ status: "playing", strikes: 1 })
  })
})

describe("tuneDial", () => {
  test("strikes on a wrong frequency, rejects one off the dial, and solves on the right one", async () => {
    const { t, code } = await startedMatch()
    const { frequency } = await bombOf(t)

    expect(await tune(t, code, frequency - 1)).toBe("strike")
    await expect(tune(t, code, 100)).rejects.toMatchObject({ data: { code: "FREQUENCY_OFF_DIAL" } })
    expect(await tune(t, code, frequency)).toBe("solved")
    expect(await moduleDoc(t, DIAL)).toMatchObject({ kind: "dial", solved: true })
    expect(await getRoom(t)).toMatchObject({ status: "playing", strikes: 1 })
    await expect(tune(t, code, frequency)).rejects.toMatchObject({ data: { code: "MODULE_ALREADY_SOLVED" } })
  })
})

describe("winning", () => {
  test("takes every module, then cancels the explosion", async () => {
    const { t, code } = await startedMatch()
    const { room, answer, presses, frequency } = await bombOf(t)

    expect(await tune(t, code, frequency)).toBe("solved")
    for (const key of presses) await press(t, code, key)
    expect(await getRoom(t)).toMatchObject({ status: "playing" })
    expect(await cut(t, code, answer)).toBe("solved")
    expect(await getRoom(t)).toMatchObject({ status: "won", strikes: 0 })
    expect(await jobState(t, room)).toBe("canceled")
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
    const { bomb, wrong, presses } = await bombOf(t)
    await cut(t, code, wrong[0] ?? -1)
    await press(t, code, presses[0] ?? -1)
    const { serial } = bomb.edgework
    const [{ wires }, { keys }, { waveform }] = bomb.modules
    const pressed = (i: number) => i === presses[0]

    const operatorView = await viewOf(t, code, operator.sessionId)
    expect(operatorView).toMatchObject({ status: "playing", strikes: 1, view: { role: "operator", serial } })
    expect(operatorView?.view).toEqual({
      role: "operator",
      serial,
      modules: [
        { kind: "wires", solved: false, wires: wires.map(({ color }, i) => ({ color, cut: i === wrong[0] })) },
        { kind: "keypad", solved: false, keys: keys.map(({ glyph }, i) => ({ glyph, pressed: pressed(i) })) },
        { kind: "dial", solved: false },
      ],
    })

    const scannerView = await viewOf(t, code, scanner.sessionId)
    expect(scannerView?.view).toEqual({
      role: "scanner",
      modules: [
        { kind: "wires", solved: false, wires: wires.map(({ tag }, i) => ({ tag, cut: i === wrong[0] })) },
        { kind: "keypad", solved: false, keys: keys.map(({ live }, i) => ({ live, pressed: pressed(i) })) },
        { kind: "dial", solved: false, waveform },
      ],
    })

    const analystView = await viewOf(t, code, analyst.sessionId)
    expect(analystView?.view).toMatchObject({
      role: "analyst",
      modules: [
        { kind: "wires", solved: false },
        { kind: "keypad", solved: false },
        { kind: "dial", solved: false },
      ],
    })
    const analystJson = JSON.stringify(analystView)
    expect(analystJson).not.toContain(serial)
    for (const field of ['"wires":[', '"tag"', '"keys"', '"live"', '"waveform"']) expect(analystJson).not.toContain(field)
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
