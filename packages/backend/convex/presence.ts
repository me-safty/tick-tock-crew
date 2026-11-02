import { v } from "convex/values"
import { mutation } from "./_generated/server"
import { resumeIfPresent } from "./pause"
import { getRoom, presence } from "./rooms"

// The web app's pagehide beacon calls `presence:disconnect` by path, so these must live in convex/presence.ts.

// A session times out after 2.5 intervals; the cap stops a client from staying "online" forever.
const MAX_HEARTBEAT_INTERVAL_MS = 30_000

export const heartbeat = mutation({
  args: { roomId: v.string(), userId: v.string(), sessionId: v.string(), interval: v.number() },
  returns: v.object({ roomToken: v.string(), sessionToken: v.string() }),
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    const room = await getRoom(ctx, roomId)
    const tokens = await presence.heartbeat(ctx, room.code, userId, sessionId, Math.min(interval, MAX_HEARTBEAT_INTERVAL_MS))
    // A player coming back is what ends a pause.
    await resumeIfPresent(ctx, room)
    return tokens
  },
})

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: (ctx, { sessionToken }) => presence.disconnect(ctx, sessionToken),
})
