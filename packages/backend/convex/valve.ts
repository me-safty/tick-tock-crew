import { type Bomb, burstAt, type MatchState } from "@tick-tock-crew/rules"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"

/**
 * Checks back when the valve in slot `module` would top out if nobody touches it. The check recomputes the
 * pressure, so one left over from before a later hold does nothing.
 */
export async function scheduleBurst(
  ctx: MutationCtx,
  { roomId, module, bomb, state }: { roomId: Id<"rooms">; module: number; bomb: Bomb; state: MatchState },
) {
  const valve = bomb.modules[module]
  const valveState = state.modules[module]
  if (valve?.kind !== "valve" || valveState?.kind !== "valve" || valveState.solved) return
  const due = burstAt(valve.gauge, valveState.progress)
  if (due !== null) await ctx.scheduler.runAt(due, internal.match.burstValve, { roomId, module })
}
