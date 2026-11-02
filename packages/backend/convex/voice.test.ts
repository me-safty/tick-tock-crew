import { afterEach, describe, expect, test, vi } from "vitest"
import { api, internal } from "./_generated/api"
import { goOnline, PLAYERS, seatAll, setup } from "./test.setup"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const [operator, analyst, scanner] = PLAYERS

async function seatedRoom() {
  const { t, code } = await setup()
  await seatAll(t, code, false)
  return { t, code }
}

describe("signals", () => {
  test("reach only the seat they are sent to, oldest first", async () => {
    const { t, code } = await seatedRoom()
    await t.mutation(api.voice.signal, { code, sessionId: operator.sessionId, toRole: "analyst", kind: "offer", payload: "o1" })
    await t.mutation(api.voice.signal, { code, sessionId: scanner.sessionId, toRole: "analyst", kind: "ice", payload: "c1" })
    await t.mutation(api.voice.signal, { code, sessionId: analyst.sessionId, toRole: "operator", kind: "answer", payload: "a1" })

    const toAnalyst = await t.query(api.voice.inbox, { code, sessionId: analyst.sessionId })
    expect(toAnalyst.map(({ fromRole, kind, payload }) => ({ fromRole, kind, payload }))).toEqual([
      { fromRole: "operator", kind: "offer", payload: "o1" },
      { fromRole: "scanner", kind: "ice", payload: "c1" },
    ])
    const toOperator = await t.query(api.voice.inbox, { code, sessionId: operator.sessionId })
    expect(toOperator.map((signal) => signal.payload)).toEqual(["a1"])
    expect(await t.query(api.voice.inbox, { code, sessionId: scanner.sessionId })).toEqual([])
  })

  test("are deleted once their recipient acks them, and only by their recipient", async () => {
    const { t, code } = await seatedRoom()
    await t.mutation(api.voice.signal, { code, sessionId: operator.sessionId, toRole: "analyst", kind: "offer", payload: "o1" })
    const ids = (await t.query(api.voice.inbox, { code, sessionId: analyst.sessionId })).map((signal) => signal.id)

    await t.mutation(api.voice.ack, { code, sessionId: scanner.sessionId, ids })
    expect(await t.query(api.voice.inbox, { code, sessionId: analyst.sessionId })).toHaveLength(1)

    await t.mutation(api.voice.ack, { code, sessionId: analyst.sessionId, ids })
    expect(await t.query(api.voice.inbox, { code, sessionId: analyst.sessionId })).toEqual([])
  })

  test("need a seat to send, ack or read", async () => {
    const { t, code } = await seatedRoom()
    await expect(
      t.mutation(api.voice.signal, { code, sessionId: "stranger", toRole: "analyst", kind: "offer", payload: "o1" }),
    ).rejects.toMatchObject({ data: { code: "SEAT_REQUIRED" } })
    await expect(t.mutation(api.voice.ack, { code, sessionId: "stranger", ids: [] })).rejects.toMatchObject({
      data: { code: "SEAT_REQUIRED" },
    })
    await t.mutation(api.voice.signal, { code, sessionId: operator.sessionId, toRole: "analyst", kind: "offer", payload: "o1" })
    expect(await t.query(api.voice.inbox, { code, sessionId: "stranger" })).toEqual([])
  })

  test("can't go to the sender's own seat or carry an oversized payload", async () => {
    const { t, code } = await seatedRoom()
    const send = (toRole: "operator" | "analyst", payload: string) =>
      t.mutation(api.voice.signal, { code, sessionId: operator.sessionId, toRole, kind: "ice", payload })
    await expect(send("operator", "c1")).rejects.toMatchObject({ data: { code: "SIGNAL_INVALID" } })
    await expect(send("analyst", "x".repeat(40_000))).rejects.toMatchObject({ data: { code: "SIGNAL_INVALID" } })
  })
})

const TURN_SERVERS = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:53?transport=udp",
        "turns:turn.cloudflare.com:443?transport=tcp",
      ],
      username: "user",
      credential: "secret",
    },
  ],
}

describe("signal limits and cleanup", () => {
  const offer = { kind: "offer", payload: "o1" } as const

  test("only reach a seat someone holds", async () => {
    const { t, code } = await setup()
    await goOnline(t, code, operator.sessionId)
    await t.mutation(api.rooms.claimSeat, { code, ...operator })
    await expect(
      t.mutation(api.voice.signal, { code, sessionId: operator.sessionId, toRole: "analyst", ...offer }),
    ).rejects.toMatchObject({ data: { code: "SIGNAL_INVALID" } })
  })

  test("past the cap, a sender's oldest unread signal makes way for its newest", async () => {
    const { t, code } = await seatedRoom()
    for (let i = 0; i < 41; i++) {
      await t.mutation(api.voice.signal, { code, sessionId: operator.sessionId, toRole: "analyst", kind: "ice", payload: `c${i}` })
    }
    await t.mutation(api.voice.signal, { code, sessionId: scanner.sessionId, toRole: "analyst", ...offer })
    const payloads = (await t.query(api.voice.inbox, { code, sessionId: analyst.sessionId })).map((signal) => signal.payload)
    expect(payloads).toHaveLength(41)
    expect(payloads).not.toContain("c0")
    expect(payloads).toContain("c40")
  })

  test("expire after a minute: the next signal to that seat clears them", async () => {
    vi.useFakeTimers()
    const { t, code } = await seatedRoom()
    await t.mutation(api.voice.signal, { code, sessionId: operator.sessionId, toRole: "analyst", ...offer })
    vi.advanceTimersByTime(61_000)
    await t.mutation(api.voice.signal, { code, sessionId: scanner.sessionId, toRole: "analyst", kind: "offer", payload: "fresh" })
    const payloads = (await t.query(api.voice.inbox, { code, sessionId: analyst.sessionId })).map((signal) => signal.payload)
    expect(payloads).toEqual(["fresh"])
  })

  test("left over when a match ends expire a minute later", async () => {
    vi.useFakeTimers()
    const { t, code } = await seatedRoom()
    for (const p of PLAYERS) await t.mutation(api.rooms.setReady, { code, sessionId: p.sessionId, ready: true })
    await t.mutation(api.rooms.startMatch, { code, sessionId: operator.sessionId })
    await t.mutation(api.voice.signal, { code, sessionId: operator.sessionId, toRole: "analyst", ...offer })
    const room = await t.run((ctx) => ctx.db.query("rooms").first())
    if (!room) throw new Error("no room")
    await t.mutation(internal.match.explode, { roomId: room._id })
    expect(await t.query(api.voice.inbox, { code, sessionId: analyst.sessionId })).toHaveLength(1)
    vi.advanceTimersByTime(61_000)
    await t.finishInProgressScheduledFunctions()
    expect(await t.query(api.voice.inbox, { code, sessionId: analyst.sessionId })).toEqual([])
  })
})

describe("iceServers", () => {
  test("mints Cloudflare TURN credentials when the deployment has a TURN key, minus port 53", async () => {
    vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "key-1")
    vi.stubEnv("CLOUDFLARE_TURN_API_TOKEN", "token-1")
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(TURN_SERVERS), { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    const { t, code } = await seatedRoom()

    const servers = await t.action(api.voice.iceServers, { code, sessionId: analyst.sessionId })

    expect(servers).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"],
        username: "user",
        credential: "secret",
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      "https://rtc.live.cloudflare.com/v1/turn/keys/key-1/credentials/generate-ice-servers",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-1" }),
        body: JSON.stringify({ ttl: 86_400 }),
      }),
    )
  })

  test("falls back to public STUN without a TURN key", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { t, code } = await seatedRoom()
    expect(await t.action(api.voice.iceServers, { code, sessionId: operator.sessionId })).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("falls back to public STUN when Cloudflare refuses", async () => {
    vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "key-1")
    vi.stubEnv("CLOUDFLARE_TURN_API_TOKEN", "bad-token")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })))
    const { t, code } = await seatedRoom()
    expect(await t.action(api.voice.iceServers, { code, sessionId: operator.sessionId })).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
    ])
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("bad-token")
  })

  test("refuses a caller without a seat", async () => {
    const { t, code } = await seatedRoom()
    await expect(t.action(api.voice.iceServers, { code, sessionId: "stranger" })).rejects.toMatchObject({
      data: { code: "SEAT_REQUIRED" },
    })
  })
})
