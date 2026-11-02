/** The quick calls on the emote wheel, in the wheel's order. */
export const EMOTES = ["yes", "no", "wait", "hurry", "repeat", "nice"] as const
export type Emote = (typeof EMOTES)[number]
