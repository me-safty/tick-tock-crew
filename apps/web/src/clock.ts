import type { Match } from "./roles"

export const secondsLeft = (endsAt: number, now: number) => Math.max(0, Math.ceil((endsAt - now) / 1000))

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

export const URGENT_SECONDS = 30

/** The time the match clock reads at `now`: it stands still while the match is paused. */
export const clockTime = (match: Match, now: number) => (match.status === "paused" ? match.pausedAt : now)
