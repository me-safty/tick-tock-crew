import { generateBomb } from "@tick-tock-crew/rules"
import { type Infer, v } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { internalMutation, mutation, type MutationCtx, query } from "./_generated/server"
import { appError } from "./errors"
import { findRoom, findSeat, getSeat } from "./rooms"
import { emote as emoteName, ping, pingTarget, role } from "./schema"

/** How long a ping or emote stays up. */
export const PING_MS = 5_000
/** Pings and emotes a seat may have up at once; the next waits for the oldest to expire. */
export const MAX_ACTIVE_PINGS = 3

const seatArgs = { code: v.string(), sessionId: v.string() }
type PingTarget = Infer<typeof pingTarget>
type Seat = Doc<"seats">

/** The Operator and Scanner point at the bomb; the Analyst, who never sees it, points at the manual. */
function checkTarget({ room, seat, target }: { room: Doc<"rooms">; seat: Seat; target: PingTarget }) {
  if (room.status !== "playing") throw appError({ code: "MATCH_OVER" })
  if ((target.kind === "manual") !== (seat.role === "analyst")) throw appError({ code: "PING_NOT_ALLOWED" })
  if (target.kind === "manual") return
  const index = (value: number) => Number.isInteger(value) && value >= 0
  const module = generateBomb(room.seed, room.difficulty).modules[target.module]
  const found = (() => {
    switch (target.kind) {
      case "module":
        return index(target.module) && module !== undefined
      case "wire":
        return module?.kind === "wires" && index(target.wire) && target.wire < module.wires.length
      case "key":
        return module?.kind === "keypad" && index(target.key) && target.key < module.keys.length
      default: {
        const _exhaustive: never = target
        return _exhaustive
      }
    }
  })()
  if (!found) throw appError({ code: "PING_TARGET_NOT_FOUND" })
}

async function send(ctx: MutationCtx, { room, seat, sent }: { room: Doc<"rooms">; seat: Seat; sent: Doc<"pings">["ping"] }) {
  const active = await ctx.db
    .query("pings")
    .withIndex("by_room_and_role", (q) => q.eq("roomId", room._id).eq("fromRole", seat.role))
    .take(MAX_ACTIVE_PINGS)
  if (active.length >= MAX_ACTIVE_PINGS) throw appError({ code: "TOO_MANY_PINGS" })
  const id = await ctx.db.insert("pings", { roomId: room._id, fromRole: seat.role, ping: sent })
  await ctx.scheduler.runAfter(PING_MS, internal.pings.expire, { id })
}

/** Points at a part of the bomb, or for the Analyst a manual section, for the whole crew. */
export const point = mutation({
  args: { ...seatArgs, target: pingTarget },
  returns: v.null(),
  handler: async (ctx, { target, ...args }) => {
    const { room, seat } = await getSeat(ctx, args)
    checkTarget({ room, seat, target })
    await send(ctx, { room, seat, sent: target })
    return null
  },
})

/** A quick call from the emote wheel. Works in the lobby too. */
export const emote = mutation({
  args: { ...seatArgs, emote: emoteName },
  returns: v.null(),
  handler: async (ctx, { emote, ...args }) => {
    const { room, seat } = await getSeat(ctx, args)
    await send(ctx, { room, seat, sent: { kind: "emote", emote } })
    return null
  },
})

export const expire = internalMutation({
  args: { id: v.id("pings") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if (await ctx.db.get("pings", id)) await ctx.db.delete("pings", id)
    return null
  },
})

/** The room's live pings and emotes, oldest first. Each carries a target ref only, so every seat may see all of them. */
export const list = query({
  args: seatArgs,
  returns: v.array(
    v.object({
      id: v.id("pings"),
      fromRole: role,
      ping,
      at: v.number(),
    }),
  ),
  handler: async (ctx, { code, sessionId }) => {
    const room = await findRoom(ctx, code)
    const seat = room && (await findSeat(ctx, { roomId: room._id, sessionId }))
    if (!room || !seat) return []
    const pings = await ctx.db
      .query("pings")
      .withIndex("by_room_and_role", (q) => q.eq("roomId", room._id))
      .take(3 * MAX_ACTIVE_PINGS)
    return pings
      .map((doc) => ({ id: doc._id, fromRole: doc.fromRole, ping: doc.ping, at: doc._creationTime }))
      .sort((a, b) => a.at - b.at)
  },
})
