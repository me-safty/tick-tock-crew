import { defineSchema, defineTable } from "convex/server"
import { v, type Infer } from "convex/values"

export const role = v.union(v.literal("operator"), v.literal("analyst"), v.literal("scanner"))
export type Role = Infer<typeof role>

const roomFields = { code: v.string(), hostSessionId: v.string() }

export default defineSchema({
  rooms: defineTable(
    v.union(
      v.object({ ...roomFields, status: v.literal("lobby") }),
      v.object({ ...roomFields, status: v.literal("playing"), seed: v.number() }),
    ),
  ).index("by_code", ["code"]),
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
