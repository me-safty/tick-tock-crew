import type { api } from "@tick-tock-crew/backend/api"
import type { FunctionReturnType } from "convex/server"

export type Lobby = NonNullable<FunctionReturnType<typeof api.rooms.lobby>>
export type Seat = Lobby["seats"][number]
export type Role = Seat["role"]

export const ROLE_INFO = {
  operator: { title: "Operator", blurb: "Sees and handles the bomb, but can't read the manual." },
  analyst: { title: "Analyst", blurb: "Reads the manual, but never sees the bomb." },
  scanner: { title: "Scanner", blurb: "Sees inside the bomb, but can't touch anything." },
} as const satisfies Record<Role, { title: string; blurb: string }>
