import type { api } from "@tick-tock-crew/backend/api"
import type { FunctionArgs, FunctionReturnType } from "convex/server"

export type Lobby = NonNullable<FunctionReturnType<typeof api.rooms.lobby>>
export type Seat = Lobby["seats"][number]

export type Match = NonNullable<FunctionReturnType<typeof api.match.view>>
export type RoleView = NonNullable<Match["view"]>
export type ViewOf<R extends RoleView["role"]> = Extract<RoleView, { role: R }>
type Target<Args> = Omit<Args, "code" | "sessionId">

/** Something the Operator does to the bomb, by module index. */
export type OperatorAction =
  | ({ readonly kind: "cut" } & Target<FunctionArgs<typeof api.match.cutWire>>)
  | ({ readonly kind: "press" } & Target<FunctionArgs<typeof api.match.pressKey>>)
  | ({ readonly kind: "tune" } & Target<FunctionArgs<typeof api.match.tuneDial>>)
  | ({ readonly kind: "hold" } & Target<FunctionArgs<typeof api.match.holdValve>>)
  | ({ readonly kind: "release" } & Target<FunctionArgs<typeof api.match.releaseValve>>)
