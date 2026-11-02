import { type MatchState, pauseState, shiftState } from "@tick-tock-crew/rules"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { internalMutation, mutation, type MutationCtx, type QueryCtx } from "./_generated/server"
import { appError } from "./errors"
import { loadMatch, type MatchRoom } from "./match"
import { findSeat, getRoom, parseName, presence, roomSeats } from "./rooms"
import { role } from "./schema"
import { scheduleBurst } from "./valve"

/** How long a seat may be gone before the match pauses, so a reload never flashes the pause. */
export const PAUSE_GRACE_MS = 5_000

/** Seated players who are offline, each with when they left (0 if they were never here). */
async function absentSeats(ctx: QueryCtx, room: Doc<"rooms">) {
  const users = new Map((await presence.listRoom(ctx, room.code)).map((user) => [user.userId, user]))
  return (await roomSeats(ctx, room._id)).flatMap((seat) => {
    const user = users.get(seat.sessionId)
    return user?.online ? [] : [{ seat, leftAt: user?.lastDisconnected ?? 0 }]
  })
}

/** Writes back the modules whose state changed. */
async function saveModules(
  ctx: MutationCtx,
  { room, modules, before, after }: {
    readonly room: MatchRoom
    readonly modules: ReadonlyArray<Doc<"modules">>
    readonly before: MatchState
    readonly after: MatchState
  },
) {
  for (const [index, doc] of modules.entries()) {
    const next = after.modules[index]
    if (next && next !== before.modules[index]) await ctx.db.replace("modules", doc._id, { roomId: room._id, index: doc.index, ...next })
  }
}

/**
 * Called by whoever sees a seat go offline mid-match. The server checks presence itself and, if the seat is
 * still empty after the grace period, pauses.
 */
export const reportAbsence = mutation({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, { code }) => {
    const room = await getRoom(ctx, code)
    if (room.status !== "playing" || (await absentSeats(ctx, room)).length === 0) return null
    await ctx.scheduler.runAfter(PAUSE_GRACE_MS, internal.pause.pauseIfAbsent, { roomId: room._id })
    return null
  },
})

export const pauseIfAbsent = internalMutation({
  args: { roomId: v.id("rooms") },
  returns: v.null(),
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get("rooms", roomId)
    const now = Date.now()
    if (room?.status !== "playing" || now >= room.endsAt) return null
    const absent = await absentSeats(ctx, room)
    if (absent.length === 0) return null
    // A player who came back and left again inside the grace period gets a fresh one, so two quick reloads don't pause.
    const graceEnds = Math.min(...absent.map(({ leftAt }) => leftAt)) + PAUSE_GRACE_MS
    if (graceEnds > now) {
      await ctx.scheduler.runAt(graceEnds, internal.pause.pauseIfAbsent, { roomId })
      return null
    }
    const { bomb, modules, state } = await loadMatch(ctx, room)
    await saveModules(ctx, { room, modules, before: state, after: pauseState(bomb, state, { at: now }) })
    await ctx.scheduler.cancel(room.explodeJobId)
    const { code, hostSessionId, seed, difficulty, endsAt, strikes } = room
    await ctx.db.replace("rooms", roomId, { code, hostSessionId, seed, difficulty, endsAt, strikes, status: "paused", pausedAt: now })
    return null
  },
})

/** Resumes a paused match once every seat is back, moving the deadline and the valve on by the time it waited. */
export async function resumeIfPresent(ctx: MutationCtx, room: Doc<"rooms">) {
  if (room.status !== "paused" || (await absentSeats(ctx, room)).length > 0) return
  const by = Date.now() - room.pausedAt
  const { bomb, modules, state } = await loadMatch(ctx, room)
  const resumed = shiftState(state, { by })
  await saveModules(ctx, { room, modules, before: state, after: resumed })
  const { code, hostSessionId, seed, difficulty, strikes } = room
  const endsAt = room.endsAt + by
  const explodeJobId = await ctx.scheduler.runAt(endsAt, internal.match.explode, { roomId: room._id })
  await ctx.db.replace("rooms", room._id, { code, hostSessionId, seed, difficulty, strikes, endsAt, status: "playing", explodeJobId })
  for (const module of resumed.modules.keys()) await scheduleBurst(ctx, { roomId: room._id, module, bomb, state: resumed })
}

/** Takes the seat of a player who dropped mid-match, as in the lobby; the match resumes once every seat is back. */
export const takeOverSeat = mutation({
  args: { code: v.string(), sessionId: v.string(), name: v.string(), role },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await getRoom(ctx, args.code)
    // Only a paused match waits for a seat; while it plays, a player reloading keeps theirs.
    if (room.status === "playing") throw appError({ code: "SEAT_TAKEN" })
    if (room.status !== "paused") throw appError({ code: "MATCH_OVER" })
    const name = parseName(args.name)
    if (await findSeat(ctx, { roomId: room._id, sessionId: args.sessionId })) throw appError({ code: "ALREADY_SEATED" })
    const seat = (await absentSeats(ctx, room)).find((absent) => absent.seat.role === args.role)?.seat
    if (!seat) throw appError({ code: "SEAT_TAKEN" })
    await ctx.db.patch("seats", seat._id, { sessionId: args.sessionId, name })
    await resumeIfPresent(ctx, room)
    return null
  },
})
