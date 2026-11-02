import { Option, Schema } from "effect"
import type { Seat } from "../roles"

export type Role = Seat["role"]

const ROLE_ORDER: ReadonlyArray<Role> = ["operator", "analyst", "scanner"]

/** Perfect negotiation needs one polite side per pair: the later role in seat order yields when both offer at once. */
export const isPolite = ({ me, peer }: { me: Role; peer: Role }) => ROLE_ORDER.indexOf(me) > ROLE_ORDER.indexOf(peer)

// `from` and `to` name RTCPeerConnections, not players, so a reloaded peer's leftover signals can be told apart.
const Ends = { from: Schema.String, to: Schema.NullOr(Schema.String) }
const SdpPayload = Schema.Struct({ ...Ends, sdp: Schema.String })
const IcePayload = Schema.Struct({
  ...Ends,
  candidate: Schema.Struct({
    candidate: Schema.optionalKey(Schema.String),
    sdpMid: Schema.optionalKey(Schema.NullOr(Schema.String)),
    sdpMLineIndex: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    usernameFragment: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
})

export type Signal =
  | ({ readonly kind: "offer" | "answer" } & typeof SdpPayload.Type)
  | ({ readonly kind: "ice" } & typeof IcePayload.Type)

/** The signals table's columns for a signal: its kind, and everything else as the JSON payload. */
export function encodeSignal(signal: Signal) {
  const { kind, ...payload } = signal
  return { kind, payload: JSON.stringify(payload) }
}

const decodeSdp = Schema.decodeUnknownOption(Schema.fromJsonString(SdpPayload))
const decodeIce = Schema.decodeUnknownOption(Schema.fromJsonString(IcePayload))

/** Null for a payload that isn't a well-formed signal of its kind. */
export function decodeSignal({ kind, payload }: { kind: Signal["kind"]; payload: string }): Signal | null {
  switch (kind) {
    case "offer":
    case "answer":
      return Option.match(decodeSdp(payload), { onNone: () => null, onSome: (body) => ({ kind, ...body }) })
    case "ice":
      return Option.match(decodeIce(payload), { onNone: () => null, onSome: (body) => ({ kind, ...body }) })
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

/**
 * What to do with a signal from a peer, given our connection to it:
 * - `deliver` it to the connection;
 * - `adopt` its sender as the remote end we hadn't heard from yet, then deliver;
 * - `reset`: a new connection on their side made a fresh offer, so start ours over and deliver;
 * - `drop` a leftover meant for an earlier connection.
 */
export type Route = "deliver" | "adopt" | "reset" | "drop"

export function routeSignal(
  link: { readonly localId: string; readonly remoteId: string | null },
  signal: Pick<Signal, "kind" | "from" | "to">,
): Route {
  if (signal.to !== null && signal.to !== link.localId) return "drop"
  if (signal.from === link.remoteId) return "deliver"
  if (signal.kind === "offer") return link.remoteId === null ? "adopt" : "reset"
  return link.remoteId === null && signal.to === link.localId ? "adopt" : "drop"
}

/** What a player's mic is doing: sending, muted, or absent so they only listen. */
export const MIC_STATES = ["live", "muted", "off"] as const
export type MicState = (typeof MIC_STATES)[number]

/**
 * Messages on each peer's data channel. It is unordered and never retransmits, so each carries a sequence number
 * and the receiver ignores anything older than what it already has. M8 adds character motion here.
 */
const ChannelMessage = Schema.Union([
  /** Sent every couple of seconds and whenever the sender's mic changes, so the others can show it. */
  Schema.Struct({ kind: Schema.Literal("heartbeat"), seq: Schema.Int, at: Schema.Finite, mic: Schema.Literals(MIC_STATES) }),
])
export type ChannelMessage = typeof ChannelMessage.Type

export const encodeMessage = (message: ChannelMessage) => JSON.stringify(message)

const decodeChannelMessage = Schema.decodeUnknownOption(Schema.fromJsonString(ChannelMessage))

/** Null for anything this build doesn't understand, such as a kind from a newer client. */
export const decodeMessage = (data: unknown): ChannelMessage | null =>
  typeof data === "string" ? Option.getOrNull(decodeChannelMessage(data)) : null

/** Whether a message is newer than the last one taken from the same peer. */
export const isFresh = ({ lastSeq, seq }: { lastSeq: number; seq: number }) => seq > lastSeq
