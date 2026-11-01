import type { api } from "@tick-tock-crew/backend/api"
import type { FunctionArgs, FunctionReturnType } from "convex/server"

export type Lobby = NonNullable<FunctionReturnType<typeof api.rooms.lobby>>
export type Seat = Lobby["seats"][number]

export type Match = NonNullable<FunctionReturnType<typeof api.match.view>>
export type RoleView = NonNullable<Match["view"]>
export type ViewOf<R extends RoleView["role"]> = Extract<RoleView, { role: R }>
export type WireRef = Pick<FunctionArgs<typeof api.match.cutWire>, "module" | "wire">
