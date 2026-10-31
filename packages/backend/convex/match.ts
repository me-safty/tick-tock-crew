import {
  COLORS,
  type CutWireError,
  cutWire as cutWireRule,
  generateBomb,
  type MatchStatus,
  matchStatus,
  viewFor,
} from "@tick-tock-crew/rules"
import { ConvexError, v } from "convex/values"
import { Effect } from "effect"
import type { Doc } from "./_generated/dataModel"
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server"
import { findRoom, findSeat, getRoom } from "./rooms"

type MatchRoom = Exclude<Doc<"rooms">, { status: "lobby" }>
type PlayingRoom = Extract<MatchRoom, { status: "playing" }>

async function loadMatch(ctx: QueryCtx, room: MatchRoom) {
  const bomb = generateBomb(room.seed, room.difficulty)
  const modules = await ctx.db
    .query("modules")
    .withIndex("by_room_and_index", (q) => q.eq("roomId", room._id))
    .take(bomb.modules.length)
  const state = { strikes: room.strikes, modules: modules.map(({ kind, solved, progress }) => ({ kind, solved, progress })) }
  return { bomb, modules, state }
}

function endedRoom(room: PlayingRoom, status: Exclude<MatchStatus, "playing">, strikes: number) {
  const { code, hostSessionId, seed, difficulty, endsAt } = room
  return { code, hostSessionId, seed, difficulty, endsAt, strikes, status }
}

export const explode = internalMutation({
  args: { roomId: v.id("rooms") },
  returns: v.null(),
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get("rooms", roomId)
    if (room?.status !== "playing") return null
    await ctx.db.replace("rooms", roomId, endedRoom(room, "lost", room.strikes))
    return null
  },
})

const moduleFields = { kind: v.literal("wires"), solved: v.boolean() }
const cut = v.boolean()
const manualBlock = v.union(
  v.object({ kind: v.literal("text"), text: v.string() }),
  v.object({ kind: v.literal("table"), columns: v.array(v.string()), rows: v.array(v.array(v.string())) }),
)
// Mirrors RoleView from the rules package; Convex rejects any field not listed here, so a leak fails loudly.
const roleView = v.union(
  v.object({
    role: v.literal("operator"),
    serial: v.string(),
    modules: v.array(
      v.object({ ...moduleFields, wires: v.array(v.object({ color: v.union(...COLORS.map((c) => v.literal(c))), cut })) }),
    ),
  }),
  v.object({
    role: v.literal("scanner"),
    modules: v.array(
      v.object({ ...moduleFields, wires: v.array(v.object({ tag: v.object({ letter: v.string(), digit: v.number() }), cut })) }),
    ),
  }),
  v.object({
    role: v.literal("analyst"),
    modules: v.array(v.object(moduleFields)),
    manual: v.array(v.object({ title: v.string(), blocks: v.array(manualBlock) })),
  }),
)

export const view = query({
  args: { code: v.string(), sessionId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(v.literal("playing"), v.literal("won"), v.literal("lost")),
      endsAt: v.number(),
      strikes: v.number(),
      view: v.union(v.null(), roleView),
    }),
  ),
  handler: async (ctx, { code, sessionId }) => {
    const room = await findRoom(ctx, code)
    if (!room || room.status === "lobby") return null
    const seat = await findSeat(ctx, { roomId: room._id, sessionId })
    const match = { status: room.status, endsAt: room.endsAt, strikes: room.strikes }
    if (!seat) return { ...match, view: null }
    const { bomb, state } = await loadMatch(ctx, room)
    return { ...match, view: viewFor(bomb, state, seat.role) }
  },
})

function cutErrorMessage(error: CutWireError) {
  switch (error._tag) {
    case "MatchOver":
      return "The match is over"
    case "ModuleNotFound":
      return "That module doesn't exist"
    case "ModuleAlreadySolved":
      return "That module is already defused"
    case "WireNotFound":
      return "That wire doesn't exist"
    case "WireAlreadyCut":
      return "That wire is already cut"
    default: {
      const _exhaustive: never = error
      return _exhaustive
    }
  }
}

export const cutWire = mutation({
  args: { code: v.string(), sessionId: v.string(), module: v.number(), wire: v.number() },
  returns: v.union(v.literal("solved"), v.literal("strike")),
  handler: async (ctx, { code, sessionId, module, wire }) => {
    const room = await getRoom(ctx, code)
    if (room.status !== "playing") throw new ConvexError("The match is over")
    const seat = await findSeat(ctx, { roomId: room._id, sessionId })
    if (seat?.role !== "operator") throw new ConvexError("Only the Operator can cut wires")
    if (Date.now() >= room.endsAt) throw new ConvexError("Time is up")

    const { bomb, modules, state } = await loadMatch(ctx, room)
    const outcome = Effect.runSync(
      cutWireRule(bomb, state, { module, wire }).pipe(Effect.mapError((error) => new ConvexError(cutErrorMessage(error)))),
    )
    const moduleDoc = modules[module]
    const next = outcome.state.modules[module]
    if (moduleDoc && next) {
      await ctx.db.patch("modules", moduleDoc._id, { solved: next.solved, progress: { cut: [...next.progress.cut] } })
    }
    const status = matchStatus(outcome.state)
    if (status === "playing") {
      await ctx.db.patch("rooms", room._id, { strikes: outcome.state.strikes })
    } else {
      await ctx.scheduler.cancel(room.explodeJobId)
      await ctx.db.replace("rooms", room._id, endedRoom(room, status, outcome.state.strikes))
    }
    return outcome.kind
  },
})
