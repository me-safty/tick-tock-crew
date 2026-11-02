import { type Infer, v } from "convex/values"
import { Option, Schema } from "effect"
import { internal } from "./_generated/api"
import { action, internalQuery, mutation, query } from "./_generated/server"
import { appError } from "./errors"
import { findRoom, findSeat, getSeat } from "./rooms"
import { role, signalKind } from "./schema"

/** An SDP offer runs a few kilobytes; anything far past that is not a signal. */
const MAX_PAYLOAD_LENGTH = 32_000
const INBOX_SIZE = 100
/** Unread signals one seat may leave for another: a few negotiations' worth of offers and ICE candidates. */
const MAX_UNREAD = 40

const seatArgs = { code: v.string(), sessionId: v.string() }

/** Sends an offer, answer or ICE candidate from the caller's seat to another seat. */
export const signal = mutation({
  args: { ...seatArgs, toRole: role, kind: signalKind, payload: v.string() },
  returns: v.null(),
  handler: async (ctx, { toRole, kind, payload, ...args }) => {
    const { room, seat } = await getSeat(ctx, args)
    if (toRole === seat.role || payload.length > MAX_PAYLOAD_LENGTH) throw appError({ code: "SIGNAL_INVALID" })
    const recipient = await ctx.db
      .query("seats")
      .withIndex("by_room_and_role", (q) => q.eq("roomId", room._id).eq("role", toRole))
      .unique()
    if (!recipient) throw appError({ code: "SIGNAL_INVALID" })
    const waiting = await ctx.db
      .query("signals")
      .withIndex("by_room_and_to", (q) => q.eq("roomId", room._id).eq("toRole", toRole))
      .take(INBOX_SIZE)
    if (waiting.filter((signal) => signal.fromRole === seat.role).length >= MAX_UNREAD) {
      throw appError({ code: "TOO_MANY_SIGNALS" })
    }
    await ctx.db.insert("signals", { roomId: room._id, fromRole: seat.role, toRole, kind, payload })
    return null
  },
})

/** The signals waiting for the caller's seat, oldest first. Nobody else's, and nothing for a player without a seat. */
export const inbox = query({
  args: seatArgs,
  returns: v.array(v.object({ id: v.id("signals"), fromRole: role, kind: signalKind, payload: v.string() })),
  handler: async (ctx, { code, sessionId }) => {
    const room = await findRoom(ctx, code)
    const seat = room && (await findSeat(ctx, { roomId: room._id, sessionId }))
    if (!room || !seat) return []
    const signals = await ctx.db
      .query("signals")
      .withIndex("by_room_and_to", (q) => q.eq("roomId", room._id).eq("toRole", seat.role))
      .take(INBOX_SIZE)
    return signals.map(({ _id, fromRole, kind, payload }) => ({ id: _id, fromRole, kind, payload }))
  },
})

/** Deletes signals the caller has read. Only the seat a signal was sent to can delete it. */
export const ack = mutation({
  args: { ...seatArgs, ids: v.array(v.id("signals")) },
  returns: v.null(),
  handler: async (ctx, { ids, ...args }) => {
    const { room, seat } = await getSeat(ctx, args)
    for (const id of ids.slice(0, INBOX_SIZE)) {
      const signal = await ctx.db.get("signals", id)
      if (signal?.roomId === room._id && signal.toRole === seat.role) await ctx.db.delete("signals", id)
    }
    return null
  },
})

const iceServer = v.object({ urls: v.array(v.string()), username: v.optional(v.string()), credential: v.optional(v.string()) })
type IceServer = Infer<typeof iceServer>

export const PUBLIC_STUN: ReadonlyArray<IceServer> = [{ urls: ["stun:stun.cloudflare.com:3478"] }]

const CloudflareIceServers = Schema.Struct({
  iceServers: Schema.Array(
    Schema.Struct({
      urls: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
      username: Schema.optional(Schema.String),
      credential: Schema.optional(Schema.String),
    }),
  ),
})

// Browsers block port 53, so a TURN URL on it only stalls ICE until it times out.
const usableInBrowsers = (url: string) => !/:53(\?|$)/.test(url)

function fromCloudflare(body: unknown): ReadonlyArray<IceServer> | null {
  const decoded = Schema.decodeUnknownOption(CloudflareIceServers)(body)
  if (Option.isNone(decoded)) return null
  const servers = decoded.value.iceServers.flatMap(({ urls, username, credential }) => {
    const usable = (typeof urls === "string" ? [urls] : urls).filter(usableInBrowsers)
    if (usable.length === 0) return []
    return [username !== undefined && credential !== undefined ? { urls: usable, username, credential } : { urls: usable }]
  })
  return servers.length > 0 ? servers : null
}

const TURN_TTL_SECONDS = 86_400
const CLOUDFLARE_TIMEOUT_MS = 5_000

async function cloudflareTurn({ keyId, token }: { keyId: string; token: string }) {
  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
        signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
      },
    )
    if (!response.ok) {
      console.warn(`Cloudflare TURN answered ${response.status}; using public STUN`)
      return null
    }
    const servers = fromCloudflare(await response.json())
    if (!servers) console.warn("Cloudflare TURN sent no usable ICE servers; using public STUN")
    return servers
  } catch (error) {
    console.warn("Cloudflare TURN is unreachable; using public STUN", error instanceof Error ? error.name : "")
    return null
  }
}

export const requireSeat = internalQuery({
  args: seatArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSeat(ctx, args)
    return null
  },
})

/**
 * ICE servers for the caller's peer connections: short-lived Cloudflare TURN credentials when the deployment has a
 * TURN key, public STUN otherwise or when Cloudflare fails.
 */
export const iceServers = action({
  args: seatArgs,
  returns: v.array(iceServer),
  handler: async (ctx, args): Promise<IceServer[]> => {
    await ctx.runQuery(internal.voice.requireSeat, args)
    const keyId = process.env["CLOUDFLARE_TURN_KEY_ID"]
    const token = process.env["CLOUDFLARE_TURN_API_TOKEN"]
    const turn = keyId && token ? await cloudflareTurn({ keyId, token }) : null
    return [...(turn ?? PUBLIC_STUN)]
  },
})
