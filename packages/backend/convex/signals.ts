import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { role } from "./schema"

const ROLES = role.members.map((member) => member.value)
const BATCH = 100

/**
 * Deletes the room's WebRTC signals: all of them when the match is over, or only those to and from `seat` when its
 * player leaves, so nobody who takes the seat next reads a stranger's offers.
 */
export async function clearSignals(ctx: MutationCtx, { roomId, seat }: { roomId: Id<"rooms">; seat?: Doc<"seats">["role"] }) {
  for (const inbox of ROLES) {
    const pending = await ctx.db
      .query("signals")
      .withIndex("by_room_and_to", (q) => q.eq("roomId", roomId).eq("toRole", inbox))
      .take(BATCH)
    for (const signal of pending) {
      if (seat === undefined || inbox === seat || signal.fromRole === seat) await ctx.db.delete("signals", signal._id)
    }
  }
}
