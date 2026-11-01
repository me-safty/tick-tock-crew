import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export const role = v.union(v.literal("operator"), v.literal("analyst"), v.literal("scanner"))

export const difficulty = v.union(v.literal("easy"), v.literal("normal"), v.literal("hard"))

const roomFields = { code: v.string(), hostSessionId: v.string() }
// The bomb is never stored: every function regenerates it from seed and difficulty.
const matchFields = { ...roomFields, seed: v.number(), difficulty, endsAt: v.number(), strikes: v.number() }

const moduleFields = { roomId: v.id("rooms"), index: v.number(), solved: v.boolean() }

export const valveEvent = v.object({
  kind: v.union(v.literal("hold"), v.literal("release"), v.literal("reset")),
  at: v.number(),
})

export default defineSchema({
  rooms: defineTable(
    v.union(
      v.object({ ...roomFields, status: v.literal("lobby") }),
      v.object({ ...matchFields, status: v.literal("playing"), explodeJobId: v.id("_scheduled_functions") }),
      v.object({ ...matchFields, status: v.union(v.literal("won"), v.literal("lost")) }),
    ),
  ).index("by_code", ["code"]),
  modules: defineTable(
    v.union(
      v.object({ ...moduleFields, kind: v.literal("wires"), progress: v.object({ cut: v.array(v.number()) }) }),
      v.object({ ...moduleFields, kind: v.literal("keypad"), progress: v.object({ pressed: v.array(v.number()) }) }),
      v.object({ ...moduleFields, kind: v.literal("dial") }),
      v.object({
        ...moduleFields,
        kind: v.literal("valve"),
        progress: v.object({ since: v.number(), events: v.array(valveEvent) }),
      }),
    ),
  ).index("by_room_and_index", ["roomId", "index"]),
  seats: defineTable({
    roomId: v.id("rooms"),
    role,
    sessionId: v.string(),
    name: v.string(),
    ready: v.boolean(),
  })
    .index("by_room_and_role", ["roomId", "role"])
    .index("by_room_and_session", ["roomId", "sessionId"]),
})
