import { describe, expect, test } from "vitest"
import { decodeMessage, decodeSignal, encodeMessage, encodeSignal, isFresh, isPolite, routeSignal, type Signal } from "./protocol"

describe("isPolite", () => {
  test("exactly one side of every pair is polite", () => {
    const roles = ["operator", "analyst", "scanner"] as const
    for (const me of roles) {
      for (const peer of roles.filter((role) => role !== me)) {
        expect(isPolite({ me, peer })).not.toBe(isPolite({ me: peer, peer: me }))
      }
    }
  })
})

describe("signal envelope", () => {
  test.each<Signal>([
    { kind: "offer", from: "a1", to: null, sdp: "v=0" },
    { kind: "answer", from: "b1", to: "a1", sdp: "v=0" },
    { kind: "ice", from: "a1", to: "b1", candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 } },
  ])("round-trips a $kind", (signal) => {
    expect(decodeSignal(encodeSignal(signal))).toEqual(signal)
  })

  test("rejects a payload that doesn't fit its kind", () => {
    expect(decodeSignal({ kind: "ice", payload: JSON.stringify({ from: "a1", to: null, sdp: "v=0" }) })).toBeNull()
    expect(decodeSignal({ kind: "offer", payload: "not json" })).toBeNull()
  })
})

describe("routeSignal", () => {
  const fresh = { localId: "a2", remoteId: null }
  const linked = { localId: "a1", remoteId: "b1" }

  test("delivers signals from the linked remote", () => {
    expect(routeSignal(linked, { kind: "ice", from: "b1", to: "a1" })).toBe("deliver")
    expect(routeSignal(linked, { kind: "offer", from: "b1", to: null })).toBe("deliver")
  })

  test("adopts the first remote that offers, or answers our own offer", () => {
    expect(routeSignal(fresh, { kind: "offer", from: "b1", to: null })).toBe("adopt")
    expect(routeSignal(fresh, { kind: "answer", from: "b1", to: "a2" })).toBe("adopt")
  })

  test("starts over when a new remote connection offers", () => {
    expect(routeSignal(linked, { kind: "offer", from: "b2", to: null })).toBe("reset")
  })

  test("drops leftovers addressed to an earlier connection of ours", () => {
    expect(routeSignal(fresh, { kind: "answer", from: "b1", to: "a1" })).toBe("drop")
    expect(routeSignal(fresh, { kind: "offer", from: "b1", to: "a1" })).toBe("drop")
  })

  test("drops stray candidates and answers from a remote we aren't linked to", () => {
    expect(routeSignal(linked, { kind: "ice", from: "b0", to: null })).toBe("drop")
    expect(routeSignal(linked, { kind: "answer", from: "b0", to: "a1" })).toBe("drop")
    expect(routeSignal(fresh, { kind: "ice", from: "b1", to: null })).toBe("drop")
  })
})

describe("channel messages", () => {
  test("round-trip a heartbeat", () => {
    const message = { kind: "heartbeat", seq: 3, at: 1_000 } as const
    expect(decodeMessage(encodeMessage(message))).toEqual(message)
  })

  test("ignore kinds from a newer client and non-text frames", () => {
    expect(decodeMessage(JSON.stringify({ kind: "motion", seq: 1, at: 0 }))).toBeNull()
    expect(decodeMessage(new ArrayBuffer(4))).toBeNull()
  })

  test("only a higher sequence number is fresh", () => {
    expect(isFresh({ lastSeq: 4, seq: 5 })).toBe(true)
    expect(isFresh({ lastSeq: 5, seq: 5 })).toBe(false)
    expect(isFresh({ lastSeq: 5, seq: 2 })).toBe(false)
  })
})
