import { describe, expect, test } from "vitest"
import { clockOffset } from "./serverClock"

describe("clockOffset", () => {
  test("trusts the shortest round trip and splits it down the middle", () => {
    expect(
      clockOffset([
        { sentAt: 1_000, serverTime: 6_000, receivedAt: 1_400 },
        { sentAt: 2_000, serverTime: 6_550, receivedAt: 2_100 },
        { sentAt: 3_000, serverTime: 9_000, receivedAt: 3_900 },
      ]),
    ).toBe(4_500)
  })

  test("is zero with nothing measured", () => {
    expect(clockOffset([])).toBe(0)
  })
})
