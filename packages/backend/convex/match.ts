import {
  type ActionError,
  type Bomb,
  COLORS,
  cutWire as cutWireRule,
  FRAMES,
  generateBomb,
  MANUAL_TEXT,
  MARKS,
  type MatchState,
  type MatchStatus,
  matchStatus,
  type Outcome,
  pressKey as pressKeyRule,
  tuneDial as tuneDialRule,
  viewFor,
  WAVE_SHAPES,
} from "@tick-tock-crew/rules"
import { v } from "convex/values"
import { Effect } from "effect"
import type { Doc } from "./_generated/dataModel"
import { type AppError, appError } from "./errors"
import { internalMutation, mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server"
import { findRoom, findSeat, getRoom } from "./rooms"

type MatchRoom = Exclude<Doc<"rooms">, { status: "lobby" }>
type PlayingRoom = Extract<MatchRoom, { status: "playing" }>

async function loadMatch(ctx: QueryCtx, room: MatchRoom) {
  const bomb = generateBomb(room.seed, room.difficulty)
  const modules = await ctx.db
    .query("modules")
    .withIndex("by_room_and_index", (q) => q.eq("roomId", room._id))
    .take(bomb.modules.length)
  const state = { strikes: room.strikes, modules: modules.map(({ _id, _creationTime, roomId, index, ...module }) => module) }
  return { bomb, modules, state }
}

function endedRoom({
  room: { code, hostSessionId, seed, difficulty, endsAt },
  status,
  strikes,
}: {
  readonly room: PlayingRoom
  readonly status: Exclude<MatchStatus, "playing">
  readonly strikes: number
}) {
  return { code, hostSessionId, seed, difficulty, endsAt, strikes, status }
}

export const explode = internalMutation({
  args: { roomId: v.id("rooms") },
  returns: v.null(),
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get("rooms", roomId)
    if (room?.status !== "playing") return null
    await ctx.db.replace("rooms", roomId, endedRoom({ room, status: "lost", strikes: room.strikes }))
    return null
  },
})

const literals = <const T extends string>(values: readonly [T, T, ...T[]]) =>
  v.union(...values.map((value) => v.literal(value)))

const solved = v.boolean()
const cut = v.boolean()
const pressed = v.boolean()
const color = literals(COLORS)
const glyph = v.object({ frame: literals(FRAMES), mark: literals(MARKS) })
const waveform = v.object({ shape: literals(WAVE_SHAPES), peaks: v.number(), height: literals(["full", "half"]) })
const manualText = literals(MANUAL_TEXT)
const manualCell = v.union(
  v.object({ kind: v.literal("digits"), digits: v.array(v.number()) }),
  v.object({ kind: v.literal("color"), color }),
  v.object({ kind: v.literal("number"), value: v.number() }),
  v.object({ kind: v.literal("glyphs"), glyphs: v.array(glyph) }),
  v.object({ kind: v.literal("wave"), shape: literals(WAVE_SHAPES) }),
)
const manualBlock = v.union(
  v.object({ kind: v.literal("text"), text: manualText }),
  v.object({ kind: v.literal("table"), columns: v.array(manualText), rows: v.array(v.array(manualCell)) }),
)
// Mirrors RoleView from the rules package; Convex rejects any field not listed here, so a leak fails loudly.
const roleView = v.union(
  v.object({
    role: v.literal("operator"),
    serial: v.string(),
    modules: v.array(
      v.union(
        v.object({ kind: v.literal("wires"), solved, wires: v.array(v.object({ color, cut })) }),
        v.object({ kind: v.literal("keypad"), solved, keys: v.array(v.object({ glyph, pressed })) }),
        v.object({ kind: v.literal("dial"), solved }),
      ),
    ),
  }),
  v.object({
    role: v.literal("scanner"),
    modules: v.array(
      v.union(
        v.object({
          kind: v.literal("wires"),
          solved,
          wires: v.array(v.object({ tag: v.object({ letter: v.string(), digit: v.number() }), cut })),
        }),
        v.object({ kind: v.literal("keypad"), solved, keys: v.array(v.object({ live: v.boolean(), pressed })) }),
        v.object({ kind: v.literal("dial"), solved, waveform }),
      ),
    ),
  }),
  v.object({
    role: v.literal("analyst"),
    modules: v.array(v.object({ kind: literals(["wires", "keypad", "dial"]), solved })),
    manual: v.array(v.object({ title: manualText, blocks: v.array(manualBlock) })),
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

function actionError(error: ActionError): AppError {
  switch (error._tag) {
    case "MatchOver":
      return { code: "MATCH_OVER" }
    case "ModuleNotFound":
      return { code: "MODULE_NOT_FOUND" }
    case "ModuleAlreadySolved":
      return { code: "MODULE_ALREADY_SOLVED" }
    case "WireNotFound":
      return { code: "WIRE_NOT_FOUND" }
    case "WireAlreadyCut":
      return { code: "WIRE_ALREADY_CUT" }
    case "KeyNotFound":
      return { code: "KEY_NOT_FOUND" }
    case "KeyAlreadyPressed":
      return { code: "KEY_ALREADY_PRESSED" }
    case "FrequencyOffDial":
      return { code: "FREQUENCY_OFF_DIAL" }
    default: {
      const _exhaustive: never = error
      return _exhaustive
    }
  }
}

/** Runs one Operator action on the room's bomb, saves the touched module and ends the match on a win or a third strike. */
async function operatorAction<Kind extends string>(
  ctx: MutationCtx,
  { code, sessionId, module }: { readonly code: string; readonly sessionId: string; readonly module: number },
  act: (bomb: Bomb, state: MatchState) => Effect.Effect<Outcome<Kind>, ActionError>,
): Promise<Kind> {
  const room = await getRoom(ctx, code)
  if (room.status !== "playing") throw appError({ code: "MATCH_OVER" })
  const seat = await findSeat(ctx, { roomId: room._id, sessionId })
  if (seat?.role !== "operator") throw appError({ code: "OPERATOR_ONLY" })
  if (Date.now() >= room.endsAt) throw appError({ code: "TIME_UP" })

  const { bomb, modules, state } = await loadMatch(ctx, room)
  const outcome = Effect.runSync(act(bomb, state).pipe(Effect.mapError((error) => appError(actionError(error)))))
  const moduleDoc = modules[module]
  const next = outcome.state.modules[module]
  if (moduleDoc && next) await ctx.db.replace("modules", moduleDoc._id, { roomId: room._id, index: moduleDoc.index, ...next })
  const status = matchStatus(outcome.state)
  if (status === "playing") {
    await ctx.db.patch("rooms", room._id, { strikes: outcome.state.strikes })
  } else {
    await ctx.scheduler.cancel(room.explodeJobId)
    await ctx.db.replace("rooms", room._id, endedRoom({ room, status, strikes: outcome.state.strikes }))
  }
  return outcome.kind
}

const target = { code: v.string(), sessionId: v.string(), module: v.number() }
const solvedOrStrike = v.union(v.literal("solved"), v.literal("strike"))

export const cutWire = mutation({
  args: { ...target, wire: v.number() },
  returns: solvedOrStrike,
  handler: (ctx, { wire, ...args }) => operatorAction(ctx, args, (bomb, state) => cutWireRule(bomb, state, { module: args.module, wire })),
})

export const pressKey = mutation({
  args: { ...target, key: v.number() },
  returns: v.union(v.literal("solved"), v.literal("accepted"), v.literal("strike")),
  handler: (ctx, { key, ...args }) => operatorAction(ctx, args, (bomb, state) => pressKeyRule(bomb, state, { module: args.module, key })),
})

export const tuneDial = mutation({
  args: { ...target, frequency: v.number() },
  returns: solvedOrStrike,
  handler: (ctx, { frequency, ...args }) =>
    operatorAction(ctx, args, (bomb, state) => tuneDialRule(bomb, state, { module: args.module, frequency })),
})
