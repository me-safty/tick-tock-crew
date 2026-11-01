import { ConvexError } from "convex/values"
import { Schema } from "effect"

const PLAIN_CODES = [
  "ROOM_NOT_FOUND",
  "MATCH_ALREADY_STARTED",
  "NO_FREE_ROOM_CODE",
  "SEAT_TAKEN",
  "SEAT_REQUIRED",
  "HOST_ONLY",
  "PLAYERS_NOT_READY",
  "MATCH_OVER",
  "OPERATOR_ONLY",
  "TIME_UP",
  "MODULE_NOT_FOUND",
  "MODULE_ALREADY_SOLVED",
  "WIRE_NOT_FOUND",
  "WIRE_ALREADY_CUT",
  "KEY_NOT_FOUND",
  "KEY_ALREADY_PRESSED",
  "FREQUENCY_OFF_DIAL",
  "VALVE_NOT_HELD",
] as const

/** What a rejected mutation carries in `ConvexError.data`. Clients translate the code; params fill in the message. */
const AppError = Schema.Union([
  Schema.Struct({ code: Schema.Literals(PLAIN_CODES) }),
  Schema.Struct({ code: Schema.Literal("NICKNAME_LENGTH"), max: Schema.Number }),
])
export type AppError = typeof AppError.Type
export type ErrorCode = AppError["code"]

export const ERROR_CODES: ReadonlyArray<ErrorCode> = [...PLAIN_CODES, "NICKNAME_LENGTH"]

export const isAppError = Schema.is(AppError)

export const appError = (error: AppError) => new ConvexError(error)
