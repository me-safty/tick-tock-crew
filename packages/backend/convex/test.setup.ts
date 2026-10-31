import presenceTest from "@convex-dev/presence/test"
import { convexTest } from "convex-test"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

export type T = Awaited<ReturnType<typeof setup>>["t"]

export const PLAYERS = [
  { sessionId: "host", name: "Hana", role: "operator" },
  { sessionId: "b", name: "Bo", role: "analyst" },
  { sessionId: "c", name: "Cy", role: "scanner" },
] as const

export async function setup() {
  const t = convexTest(schema, modules)
  presenceTest.register(t)
  const code = await t.mutation(api.rooms.createRoom, { sessionId: "host" })
  return { t, code }
}

export function goOnline(t: T, code: string, sessionId: string) {
  return t.mutation(api.presence.heartbeat, { roomId: code, userId: sessionId, sessionId: `tab-${sessionId}`, interval: 10_000 })
}

export async function seatAll(t: T, code: string, ready: boolean) {
  for (const p of PLAYERS) {
    await goOnline(t, code, p.sessionId)
    await t.mutation(api.rooms.claimSeat, { code, ...p })
    await t.mutation(api.rooms.setReady, { code, sessionId: p.sessionId, ready })
  }
}

export async function startedMatch() {
  const { t, code } = await setup()
  await seatAll(t, code, true)
  await t.mutation(api.rooms.startMatch, { code, sessionId: "host" })
  return { t, code }
}
