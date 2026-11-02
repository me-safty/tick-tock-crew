import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"

/** A signal nobody read within this long belongs to a negotiation that has been given up on or retried. */
export const SIGNAL_TTL_MS = 60_000

/** Deletes the signals waiting for `toRole` that are older than SIGNAL_TTL_MS. */
export async function pruneSignals(
  ctx: MutationCtx,
  { roomId, toRole, now }: { roomId: Id<"rooms">; toRole: Doc<"seats">["role"]; now: number },
) {
  const expired = await ctx.db
    .query("signals")
    .withIndex("by_room_and_to", (q) => q.eq("roomId", roomId).eq("toRole", toRole).lt("_creationTime", now - SIGNAL_TTL_MS))
    .take(100)
  for (const signal of expired) await ctx.db.delete("signals", signal._id)
}
