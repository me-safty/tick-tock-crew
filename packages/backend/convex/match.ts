import type { MatchStatus } from "@tick-tock-crew/rules"
import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"

type PlayingRoom = Extract<Doc<"rooms">, { status: "playing" }>

export function endedRoom(room: PlayingRoom, status: Exclude<MatchStatus, "playing">, strikes: number) {
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
