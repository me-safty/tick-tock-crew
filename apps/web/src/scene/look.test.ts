import { describe, expect, it } from "vitest"
import { dragLook, lookAt } from "./look"

describe("lookAt", () => {
  it("faces down -Z at zero angles", () => {
    const look = lookAt({ position: [0, 1, 2], target: [0, 1, 0] })
    expect(look.yaw).toBeCloseTo(0)
    expect(look.pitch).toBeCloseTo(0)
  })

  it("turns left and down toward a target on the left and below", () => {
    const look = lookAt({ position: [0, 2, 0], target: [-1, 1, 0] })
    expect(look.yaw).toBeCloseTo(Math.PI / 2)
    expect(look.pitch).toBeCloseTo(-Math.PI / 4)
  })
})

describe("dragLook", () => {
  const limits = { yaw: 0.5, pitch: 0.3 }

  it("turns by the drag distance", () => {
    const look = dragLook({ look: { yaw: 0, pitch: 0 }, dx: 50, dy: -25, limits })
    expect(look.yaw).toBeCloseTo(0.2)
    expect(look.pitch).toBeCloseTo(-0.1)
  })

  it("stops at the seat's limits in both directions", () => {
    expect(dragLook({ look: { yaw: 0.4, pitch: 0.2 }, dx: 1000, dy: 1000, limits })).toEqual(limits)
    expect(dragLook({ look: { yaw: -0.4, pitch: -0.2 }, dx: -1000, dy: -1000, limits })).toEqual({ yaw: -0.5, pitch: -0.3 })
  })

  it("turns back from a limit right away", () => {
    const look = dragLook({ look: limits, dx: -25, dy: -25, limits })
    expect(look.yaw).toBeCloseTo(0.4)
    expect(look.pitch).toBeCloseTo(0.2)
  })
})
