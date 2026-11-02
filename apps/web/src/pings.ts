import { api } from "@tick-tock-crew/backend/api"
import type { FunctionArgs, FunctionReturnType } from "convex/server"
import { useMutation, useQuery } from "convex/react"
import { useMutationError } from "./errors"
import { sessionId } from "./guest"

export type Ping = FunctionReturnType<typeof api.pings.list>[number]
export type PingTarget = FunctionArgs<typeof api.pings.point>["target"]
/** A ping on a part of the bomb, which the Operator and Scanner see highlighted. */
export type BombTarget = Exclude<PingTarget, { kind: "manual" }>
export type Emote = FunctionArgs<typeof api.pings.emote>["emote"]
export type ManualSection = Extract<PingTarget, { kind: "manual" }>["section"]

const EMPTY: ReadonlyArray<Ping> = []

/** The room's live pings and emotes, and sending new ones. */
export function usePings(code: string) {
  const pings = useQuery(api.pings.list, { code, sessionId }) ?? EMPTY
  const point = useMutation(api.pings.point)
  const emote = useMutation(api.pings.emote)
  const { error, run } = useMutationError({ transient: true })
  return {
    pings,
    error,
    point: (target: PingTarget) => void run(point({ code, sessionId, target })),
    emote: (sent: Emote) => void run(emote({ code, sessionId, emote: sent })),
  }
}

/** Each role's newest ping on the bomb; a new one replaces the last. */
export function bombPings(pings: ReadonlyArray<Ping>) {
  const latest = new Map<Ping["fromRole"], BombTarget>()
  for (const { fromRole, ping } of pings) {
    if (ping.kind !== "emote" && ping.kind !== "manual") latest.set(fromRole, ping)
  }
  return [...latest].map(([fromRole, target]) => ({ fromRole, target }))
}

/** The manual sections the Analyst is pointing at. */
export const pingedSections = (pings: ReadonlyArray<Ping>) =>
  new Set(pings.flatMap(({ ping }) => (ping.kind === "manual" ? [ping.section] : [])))
