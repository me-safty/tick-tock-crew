import presenceTest from "@convex-dev/presence/test"
import { convexTest } from "convex-test"
import { describe, expect, test } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

type T = Awaited<ReturnType<typeof setup>>["t"]

function goOnline(t: T, code: string, sessionId: string) {
  return t.mutation(api.presence.heartbeat, { roomId: code, userId: sessionId, sessionId: `tab-${sessionId}`, interval: 10_000 })
}

async function setup() {
  const t = convexTest(schema, modules)
  presenceTest.register(t)
  const code = await t.mutation(api.rooms.createRoom, { sessionId: "host" })
  return { t, code }
}

describe("createRoom and joinRoom", () => {
  test("creates a 4-letter code without ambiguous letters", async () => {
    const { code } = await setup()
    expect(code).toMatch(/^[A-HJKMNP-Z]{4}$/)
  })

  test("joins by code, ignoring case and spaces", async () => {
    const { t, code } = await setup()
    expect(await t.mutation(api.rooms.joinRoom, { code: ` ${code.toLowerCase()} ` })).toBe(code)
  })

  test("rejects an unknown code", async () => {
    const { t } = await setup()
    await expect(t.mutation(api.rooms.joinRoom, { code: "ZZZZ0" })).rejects.toThrow("Room not found")
  })
})

describe("claimSeat", () => {
  test("rejects a seat another online session holds", async () => {
    const { t, code } = await setup()
    await goOnline(t, code, "a")
    await t.mutation(api.rooms.claimSeat, { code, sessionId: "a", name: "Ada", role: "operator" })
    await expect(
      t.mutation(api.rooms.claimSeat, { code, sessionId: "b", name: "Bo", role: "operator" }),
    ).rejects.toThrow("That seat is taken")
  })

  test("lets another session take the seat of an offline player", async () => {
    const { t, code } = await setup()
    await t.mutation(api.rooms.claimSeat, { code, sessionId: "a", name: "Ada", role: "operator" })
    await t.mutation(api.rooms.claimSeat, { code, sessionId: "b", name: "Bo", role: "operator" })

    const lobby = await t.query(api.rooms.lobby, { code, sessionId: "a" })
    expect(lobby?.seats[0]?.player).toMatchObject({ name: "Bo", isYou: false })
  })

  test("moves a session to the new seat instead of holding two", async () => {
    const { t, code } = await setup()
    await t.mutation(api.rooms.claimSeat, { code, sessionId: "a", name: "Ada", role: "operator" })
    await t.mutation(api.rooms.setReady, { code, sessionId: "a", ready: true })
    await t.mutation(api.rooms.claimSeat, { code, sessionId: "a", name: "Ada", role: "scanner" })

    const lobby = await t.query(api.rooms.lobby, { code, sessionId: "a" })
    expect(lobby?.seats).toEqual([
      { role: "operator", player: null },
      { role: "analyst", player: null },
      { role: "scanner", player: { name: "Ada", ready: false, online: false, isHost: false, isYou: true } },
    ])
  })

  test("frees the seat on leave so another session can claim it", async () => {
    const { t, code } = await setup()
    await t.mutation(api.rooms.claimSeat, { code, sessionId: "a", name: "Ada", role: "analyst" })
    await t.mutation(api.rooms.leaveSeat, { code, sessionId: "a" })
    await t.mutation(api.rooms.claimSeat, { code, sessionId: "b", name: "Bo", role: "analyst" })

    const lobby = await t.query(api.rooms.lobby, { code, sessionId: "b" })
    expect(lobby?.seats[1]?.player?.name).toBe("Bo")
  })

  test("rejects a blank nickname", async () => {
    const { t, code } = await setup()
    await expect(
      t.mutation(api.rooms.claimSeat, { code, sessionId: "a", name: "   ", role: "operator" }),
    ).rejects.toThrow("nickname")
  })
})

describe("startMatch", () => {
  async function seatAll(t: T, code: string, ready: boolean) {
    const players = [
      { sessionId: "host", name: "Hana", role: "operator" },
      { sessionId: "b", name: "Bo", role: "analyst" },
      { sessionId: "c", name: "Cy", role: "scanner" },
    ] as const
    for (const p of players) {
      await goOnline(t, code, p.sessionId)
      await t.mutation(api.rooms.claimSeat, { code, ...p })
      await t.mutation(api.rooms.setReady, { code, sessionId: p.sessionId, ready })
    }
  }

  test("rejects when a seat is empty", async () => {
    const { t, code } = await setup()
    await goOnline(t, code, "host")
    await t.mutation(api.rooms.claimSeat, { code, sessionId: "host", name: "Hana", role: "operator" })
    await t.mutation(api.rooms.setReady, { code, sessionId: "host", ready: true })
    await expect(t.mutation(api.rooms.startMatch, { code, sessionId: "host" })).rejects.toThrow(
      "All 3 players must be seated, online and ready",
    )
  })

  test("rejects when a seated player is not ready", async () => {
    const { t, code } = await setup()
    await seatAll(t, code, true)
    await t.mutation(api.rooms.setReady, { code, sessionId: "c", ready: false })
    await expect(t.mutation(api.rooms.startMatch, { code, sessionId: "host" })).rejects.toThrow(
      "All 3 players must be seated, online and ready",
    )
  })

  test("rejects when a ready player is offline", async () => {
    const { t, code } = await setup()
    await seatAll(t, code, true)
    const { sessionToken } = await goOnline(t, code, "c")
    await t.mutation(api.presence.disconnect, { sessionToken })
    await expect(t.mutation(api.rooms.startMatch, { code, sessionId: "host" })).rejects.toThrow(
      "All 3 players must be seated, online and ready",
    )
  })

  test("rejects a caller who is not the host", async () => {
    const { t, code } = await setup()
    await seatAll(t, code, true)
    await expect(t.mutation(api.rooms.startMatch, { code, sessionId: "b" })).rejects.toThrow(
      "Only the host can start the match",
    )
  })

  test("starts with a seed and then locks the seats", async () => {
    const { t, code } = await setup()
    await seatAll(t, code, true)
    await t.mutation(api.rooms.startMatch, { code, sessionId: "host" })

    const room = await t.run((ctx) => ctx.db.query("rooms").first())
    expect(room).toMatchObject({ status: "playing", seed: expect.any(Number) })
    await expect(t.mutation(api.rooms.leaveSeat, { code, sessionId: "b" })).rejects.toThrow(
      "The match has already started",
    )
  })
})

describe("presence", () => {
  test("shows a seat online while its player heartbeats and offline after they leave", async () => {
    const { t, code } = await setup()
    await t.mutation(api.rooms.claimSeat, { code, sessionId: "a", name: "Ada", role: "operator" })
    const seatOnline = async () => {
      const lobby = await t.query(api.rooms.lobby, { code, sessionId: "a" })
      return { online: lobby?.seats[0]?.player?.online, count: lobby?.onlineCount }
    }
    expect(await seatOnline()).toEqual({ online: false, count: 0 })

    const { sessionToken } = await goOnline(t, code.toLowerCase(), "a")
    expect(await seatOnline()).toEqual({ online: true, count: 1 })

    await t.mutation(api.presence.disconnect, { sessionToken })
    expect(await seatOnline()).toEqual({ online: false, count: 0 })
  })

  test("rejects heartbeats for unknown rooms", async () => {
    const { t } = await setup()
    await expect(
      t.mutation(api.presence.heartbeat, { roomId: "ZZZZ0", userId: "a", sessionId: "tab-1", interval: 10_000 }),
    ).rejects.toThrow("Room not found")
  })
})
