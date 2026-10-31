import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { getRoom, presence } from "./rooms"

// The hook's beforeunload beacon calls `presence:disconnect`, so these must live in convex/presence.ts.

// A session times out after 2.5 intervals; the cap stops a client from staying "online" forever.
const MAX_HEARTBEAT_INTERVAL_MS = 30_000

export const heartbeat = mutation({
  args: { roomId: v.string(), userId: v.string(), sessionId: v.string(), interval: v.number() },
  returns: v.object({ roomToken: v.string(), sessionToken: v.string() }),
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    const room = await getRoom(ctx, roomId)
    return presence.heartbeat(ctx, room.code, userId, sessionId, Math.min(interval, MAX_HEARTBEAT_INTERVAL_MS))
  },
})

// usePresence subscribes to this list, but its userIds are guest sessionIds, which act as credentials.
// The lobby query joins presence server-side instead, so this returns nothing.
export const list = query({
  args: { roomToken: v.string() },
  returns: v.array(v.object({ userId: v.string(), online: v.boolean(), lastDisconnected: v.number() })),
  handler: () => [],
})

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: (ctx, { sessionToken }) => presence.disconnect(ctx, sessionToken),
})
