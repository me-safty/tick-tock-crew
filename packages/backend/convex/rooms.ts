import { Presence } from "@convex-dev/presence"
import { type Difficulty, generateBomb, initialState, MATCH_MS } from "@tick-tock-crew/rules"
import { v } from "convex/values"
import { components, internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { appError } from "./errors"
import { mutation, query, type QueryCtx } from "./_generated/server"
import { difficulty, role } from "./schema"
import { scheduleBurst } from "./valve"

// Presence rooms are keyed by room code and users by guest sessionId.
export const presence = new Presence(components.presence)

const ROLES = role.members.map((member) => member.value)
// No I, L or O: they read like 1 and 0 when a code is shared aloud or in a chat.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ"
const CODE_LENGTH = 4
const MAX_CODE_ATTEMPTS = 10
const MAX_NAME_LENGTH = 20
const DEFAULT_DIFFICULTY: Difficulty = "normal"

function randomCode() {
  return Array.from({ length: CODE_LENGTH }, () =>
    CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length)),
  ).join("")
}

export function findRoom(ctx: QueryCtx, code: string) {
  return ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .unique()
}

export async function getRoom(ctx: QueryCtx, code: string) {
  const room = await findRoom(ctx, code)
  if (!room) throw appError({ code: "ROOM_NOT_FOUND" })
  return room
}

async function getLobbyRoom(ctx: QueryCtx, code: string) {
  const room = await getRoom(ctx, code)
  if (room.status !== "lobby") throw appError({ code: "MATCH_ALREADY_STARTED" })
  return room
}

export function roomSeats(ctx: QueryCtx, roomId: Id<"rooms">) {
  return ctx.db
    .query("seats")
    .withIndex("by_room_and_role", (q) => q.eq("roomId", roomId))
    .take(ROLES.length)
}

export function findSeat(ctx: QueryCtx, { roomId, sessionId }: Pick<Doc<"seats">, "roomId" | "sessionId">) {
  return ctx.db
    .query("seats")
    .withIndex("by_room_and_session", (q) => q.eq("roomId", roomId).eq("sessionId", sessionId))
    .unique()
}

/** The room and the caller's seat in it, for functions only seated players may call. */
export async function getSeat(ctx: QueryCtx, { code, sessionId }: { readonly code: string; readonly sessionId: string }) {
  const room = await getRoom(ctx, code)
  const seat = await findSeat(ctx, { roomId: room._id, sessionId })
  if (!seat) throw appError({ code: "SEAT_REQUIRED" })
  return { room, seat }
}

export async function onlineSessions(ctx: QueryCtx, code: string) {
  return new Set((await presence.listRoom(ctx, code, true)).map((p) => p.userId))
}

/**
 * Who hosts the room: its creator while they are here, else the first present player by seat, else anyone
 * present. Hosting follows whoever is around, so a room whose host left never gets stuck.
 */
function hostOf({
  room,
  seats,
  online,
}: {
  readonly room: Doc<"rooms">
  readonly seats: ReadonlyArray<Doc<"seats">>
  readonly online: ReadonlySet<string>
}) {
  if (online.has(room.hostSessionId)) return room.hostSessionId
  const seated = ROLES.flatMap((seatRole) => seats.filter((seat) => seat.role === seatRole && online.has(seat.sessionId)))
  return seated[0]?.sessionId ?? online.values().next().value ?? room.hostSessionId
}

/** The lobby room, its seats and who is online, for functions only the host may call. */
async function getHostedLobby(ctx: QueryCtx, { code, sessionId }: { readonly code: string; readonly sessionId: string }) {
  const room = await getLobbyRoom(ctx, code)
  const seats = await roomSeats(ctx, room._id)
  const online = await onlineSessions(ctx, room.code)
  if (hostOf({ room, seats, online }) !== sessionId) throw appError({ code: "HOST_ONLY" })
  return { room, seats, online }
}

export function parseName(name: string) {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw appError({ code: "NICKNAME_LENGTH", max: MAX_NAME_LENGTH })
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
      await ctx.db.insert("rooms", { code, hostSessionId: sessionId, status: "lobby", difficulty: DEFAULT_DIFFICULTY })
      return code
    }
    throw appError({ code: "NO_FREE_ROOM_CODE" })
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
      if ((await onlineSessions(ctx, room.code)).has(taken.sessionId)) throw appError({ code: "SEAT_TAKEN" })
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
    if (!seat) throw appError({ code: "SEAT_REQUIRED" })
    await ctx.db.patch("seats", seat._id, { ready })
    return null
  },
})

export const setDifficulty = mutation({
  args: { code: v.string(), sessionId: v.string(), difficulty },
  returns: v.null(),
  handler: async (ctx, { difficulty, ...args }) => {
    const { room } = await getHostedLobby(ctx, args)
    await ctx.db.patch("rooms", room._id, { difficulty })
    return null
  },
})

export const startMatch = mutation({
  args: { code: v.string(), sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seats, online } = await getHostedLobby(ctx, args)
    if (seats.length < ROLES.length || seats.some((seat) => !seat.ready || !online.has(seat.sessionId))) {
      throw appError({ code: "PLAYERS_NOT_READY" })
    }
    const seed = Math.floor(Math.random() * 2 ** 32)
    const difficulty = room.difficulty ?? DEFAULT_DIFFICULTY
    const startedAt = Date.now()
    const endsAt = startedAt + MATCH_MS[difficulty]
    const explodeJobId = await ctx.scheduler.runAt(endsAt, internal.match.explode, { roomId: room._id })
    await ctx.db.patch("rooms", room._id, {
      status: "playing",
      seed,
      difficulty,
      endsAt,
      strikes: 0,
      explodeJobId,
    })
    const bomb = generateBomb(seed, difficulty)
    const state = initialState(bomb, { startedAt })
    for (const [index, module] of state.modules.entries()) {
      await ctx.db.insert("modules", { roomId: room._id, index, ...module })
      await scheduleBurst(ctx, { roomId: room._id, module: index, bomb, state })
    }
    return null
  },
})

/** Brings the crew back to this room's lobby after a match, in the same seats and not ready; the next start rolls a new bomb. */
export const playAgain = mutation({
  args: { code: v.string(), sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { code, sessionId }) => {
    const room = await getRoom(ctx, code)
    if (room.status === "lobby") return null
    if (room.status !== "won" && room.status !== "lost") throw appError({ code: "MATCH_ALREADY_STARTED" })
    if (!(await findSeat(ctx, { roomId: room._id, sessionId }))) throw appError({ code: "SEAT_REQUIRED" })
    const modules = await ctx.db
      .query("modules")
      .withIndex("by_room_and_index", (q) => q.eq("roomId", room._id))
      .take(generateBomb(room.seed, room.difficulty).modules.length)
    for (const module of modules) await ctx.db.delete("modules", module._id)
    for (const seat of await roomSeats(ctx, room._id)) await ctx.db.patch("seats", seat._id, { ready: false })
    const { hostSessionId, difficulty } = room
    await ctx.db.replace("rooms", room._id, { code: room.code, hostSessionId, difficulty, status: "lobby" })
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
      status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("paused"), v.literal("won"), v.literal("lost")),
      difficulty,
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
    const host = hostOf({ room, seats, online })
    return {
      code: room.code,
      status: room.status,
      difficulty: room.difficulty ?? DEFAULT_DIFFICULTY,
      isHost: host === sessionId,
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
                isHost: seat.sessionId === host,
                isYou: seat.sessionId === sessionId,
              }
            : null,
        }
      }),
    }
  },
})
