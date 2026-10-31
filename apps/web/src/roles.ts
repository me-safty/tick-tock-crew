import type { api } from "@tick-tock-crew/backend/api"
import type { FunctionArgs, FunctionReturnType } from "convex/server"

export type Lobby = NonNullable<FunctionReturnType<typeof api.rooms.lobby>>
export type Seat = Lobby["seats"][number]
type Role = Seat["role"]

export type Match = NonNullable<FunctionReturnType<typeof api.match.view>>
export type RoleView = NonNullable<Match["view"]>
export type ViewOf<R extends RoleView["role"]> = Extract<RoleView, { role: R }>
export type WireRef = Pick<FunctionArgs<typeof api.match.cutWire>, "module" | "wire">

export const ROLE_INFO = {
  operator: { title: "Operator", blurb: "Sees and handles the bomb, but can't read the manual." },
  analyst: { title: "Analyst", blurb: "Reads the manual, but never sees the bomb." },
  scanner: { title: "Scanner", blurb: "Sees inside the bomb, but can't touch anything." },
} as const satisfies Record<Role, { title: string; blurb: string }>
