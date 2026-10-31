import { Presence } from "@convex-dev/presence"
import { ConvexError, v } from "convex/values"
import { components } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { mutation, query, type QueryCtx } from "./_generated/server"
import { role } from "./schema"

// Presence rooms are keyed by room code and users by guest sessionId.
export const presence = new Presence(components.presence)

const ROLES = role.members.map((member) => member.value)
// No I, L or O: they read like 1 and 0 when a code is shared aloud or in a chat.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ"
const CODE_LENGTH = 4
const MAX_CODE_ATTEMPTS = 10
const MAX_NAME_LENGTH = 20

function randomCode() {
  return Array.from({ length: CODE_LENGTH }, () =>
    CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length)),
  ).join("")
}

function findRoom(ctx: QueryCtx, code: string) {
  return ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .unique()
}

export async function getRoom(ctx: QueryCtx, code: string) {
  const room = await findRoom(ctx, code)
  if (!room) throw new ConvexError("Room not found")
  return room
}

async function getLobbyRoom(ctx: QueryCtx, code: string) {
  const room = await getRoom(ctx, code)
  if (room.status !== "lobby") throw new ConvexError("The match has already started")
  return room
}

function roomSeats(ctx: QueryCtx, roomId: Id<"rooms">) {
  return ctx.db
    .query("seats")
    .withIndex("by_room_and_role", (q) => q.eq("roomId", roomId))
    .take(ROLES.length)
}

function findSeat(ctx: QueryCtx, { roomId, sessionId }: Pick<Doc<"seats">, "roomId" | "sessionId">) {
  return ctx.db
    .query("seats")
    .withIndex("by_room_and_session", (q) => q.eq("roomId", roomId).eq("sessionId", sessionId))
    .unique()
}

async function onlineSessions(ctx: QueryCtx, code: string) {
  return new Set((await presence.listRoom(ctx, code, true)).map((p) => p.userId))
}

function parseName(name: string) {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new ConvexError(`Pick a nickname of 1 to ${MAX_NAME_LENGTH} characters`)
  }
  return trimmed
}

export const createRoom = mutation({
  args: { sessionId: v.string() },
  returns: v.string(),
  handler: async (ctx, { sessionId }) => {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = randomCode()
      if (await findRoom(ctx, code)) continue
      await ctx.db.insert("rooms", { code, hostSessionId: sessionId, status: "lobby" })
      return code
    }
    throw new ConvexError("Could not find a free room code, try again")
  },
})

export const joinRoom = mutation({
  args: { code: v.string() },
  returns: v.string(),
  handler: async (ctx, { code }) => (await getRoom(ctx, code)).code,
})

export const claimSeat = mutation({
  args: { code: v.string(), sessionId: v.string(), name: v.string(), role },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await getLobbyRoom(ctx, args.code)
    const name = parseName(args.name)
    const taken = await ctx.db
      .query("seats")
      .withIndex("by_room_and_role", (q) => q.eq("roomId", room._id).eq("role", args.role))
      .unique()
    if (taken?.sessionId === args.sessionId) return null
    if (taken) {
      if ((await onlineSessions(ctx, room.code)).has(taken.sessionId)) throw new ConvexError("That seat is taken")
      await ctx.db.delete("seats", taken._id)
    }
    const current = await findSeat(ctx, { roomId: room._id, sessionId: args.sessionId })
    if (current) await ctx.db.delete("seats", current._id)
    await ctx.db.insert("seats", {
      roomId: room._id,
      role: args.role,
      sessionId: args.sessionId,
      name,
      ready: false,
    })
    return null
  },
})

export const leaveSeat = mutation({
  args: { code: v.string(), sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { code, sessionId }) => {
    const room = await getLobbyRoom(ctx, code)
    const seat = await findSeat(ctx, { roomId: room._id, sessionId })
    if (seat) await ctx.db.delete("seats", seat._id)
    return null
  },
})

export const setReady = mutation({
  args: { code: v.string(), sessionId: v.string(), ready: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { code, sessionId, ready }) => {
    const room = await getLobbyRoom(ctx, code)
    const seat = await findSeat(ctx, { roomId: room._id, sessionId })
    if (!seat) throw new ConvexError("Claim a seat first")
    await ctx.db.patch("seats", seat._id, { ready })
    return null
  },
})

export const startMatch = mutation({
  args: { code: v.string(), sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { code, sessionId }) => {
    const room = await getLobbyRoom(ctx, code)
    if (room.hostSessionId !== sessionId) throw new ConvexError("Only the host can start the match")
    const seats = await roomSeats(ctx, room._id)
    if (seats.length < ROLES.length || seats.some((seat) => !seat.ready)) {
      throw new ConvexError("All 3 seats must be filled and ready")
    }
    await ctx.db.patch("rooms", room._id, { status: "playing", seed: Math.floor(Math.random() * 2 ** 32) })
    return null
  },
})

const player = v.object({
  name: v.string(),
  ready: v.boolean(),
  online: v.boolean(),
  isHost: v.boolean(),
  isYou: v.boolean(),
})

export const lobby = query({
  args: { code: v.string(), sessionId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      code: v.string(),
      status: v.union(v.literal("lobby"), v.literal("playing")),
      isHost: v.boolean(),
      onlineCount: v.number(),
      seats: v.array(v.object({ role, player: v.union(v.null(), player) })),
    }),
  ),
  handler: async (ctx, { code, sessionId }) => {
    const room = await findRoom(ctx, code)
    if (!room) return null
    const seats = await roomSeats(ctx, room._id)
    const online = await onlineSessions(ctx, room.code)
    return {
      code: room.code,
      status: room.status,
      isHost: room.hostSessionId === sessionId,
      onlineCount: online.size,
      seats: ROLES.map((seatRole) => {
        const seat = seats.find((s) => s.role === seatRole)
        return {
          role: seatRole,
          player: seat
            ? {
                name: seat.name,
                ready: seat.ready,
                online: online.has(seat.sessionId),
                isHost: seat.sessionId === room.hostSessionId,
                isYou: seat.sessionId === sessionId,
              }
            : null,
        }
      }),
    }
  },
})
