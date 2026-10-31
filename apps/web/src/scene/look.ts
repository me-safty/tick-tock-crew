export type Vec3 = readonly [number, number, number]

/** Camera angles in radians, applied in YXZ order: positive yaw turns left, positive pitch looks up. */
export type Look = { readonly yaw: number; readonly pitch: number }

export type Seat = {
  readonly position: Vec3
  readonly target: Vec3
  readonly fov: number
  /** How far the view may turn away from the target on each axis. */
  readonly limits: Look
}

/** The angles that face `target` from `position`. */
export function lookAt({ position, target }: Pick<Seat, "position" | "target">): Look {
  const [dx, dy, dz] = [target[0] - position[0], target[1] - position[1], target[2] - position[2]]
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}

const RADIANS_PER_PIXEL = 0.004

const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value))

/** Grab-style: the scene follows the pointer, so dragging right turns the view left. */
export function dragLook({ look, dx, dy, limits }: { look: Look; dx: number; dy: number; limits: Look }): Look {
  return {
    yaw: clamp(look.yaw + dx * RADIANS_PER_PIXEL, limits.yaw),
    pitch: clamp(look.pitch + dy * RADIANS_PER_PIXEL, limits.pitch),
  }
}
