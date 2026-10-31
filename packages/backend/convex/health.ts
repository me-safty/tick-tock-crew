import { status } from "@tick-tock-crew/rules"
import { v } from "convex/values"
import { Effect } from "effect"
import { query } from "./_generated/server"

export const health = query({
  args: {},
  returns: v.literal("ok"),
  handler: () => Effect.runSync(status),
})
