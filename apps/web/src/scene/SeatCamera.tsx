import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import { MathUtils } from "three"
import { dragLook, type Look, lookAt, type Seat } from "./look"

const SHAKE_AMPLITUDE = 0.07
const SHAKE_DECAY = 2.6

/** Holds the camera at a fixed seat; dragging anywhere on the canvas turns the view within the seat's limits. */
export function SeatCamera({ seat, shaking }: { readonly seat: Seat; readonly shaking: boolean }) {
  const camera = useThree((state) => state.camera)
  const element = useThree((state) => state.gl.domElement)
  const base = useMemo(() => lookAt(seat), [seat])
  const goal = useRef<Look>({ yaw: 0, pitch: 0 })
  const current = useRef<Look>({ yaw: 0, pitch: 0 })
  const shakeStartedAt = useRef<number | null>(null)

  useEffect(() => {
    let last: { id: number; x: number; y: number } | null = null
    const down = (event: PointerEvent) => {
      if (last) return
      last = { id: event.pointerId, x: event.clientX, y: event.clientY }
    }
    const move = (event: PointerEvent) => {
      if (last?.id !== event.pointerId) return
      goal.current = dragLook({
        look: goal.current,
        dx: event.clientX - last.x,
        dy: event.clientY - last.y,
        limits: seat.limits,
      })
      last = { id: event.pointerId, x: event.clientX, y: event.clientY }
    }
    const up = (event: PointerEvent) => {
      if (last?.id === event.pointerId) last = null
    }
    element.addEventListener("pointerdown", down)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      element.removeEventListener("pointerdown", down)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
    }
  }, [element, seat.limits])

  useFrame(({ clock }, delta) => {
    current.current = {
      yaw: MathUtils.damp(current.current.yaw, goal.current.yaw, 10, delta),
      pitch: MathUtils.damp(current.current.pitch, goal.current.pitch, 10, delta),
    }
    camera.rotation.set(base.pitch + current.current.pitch, base.yaw + current.current.yaw, 0, "YXZ")
    camera.position.set(...seat.position)
    if (!shaking) {
      shakeStartedAt.current = null
      return
    }
    shakeStartedAt.current ??= clock.elapsedTime
    const amplitude = SHAKE_AMPLITUDE * Math.exp(-(clock.elapsedTime - shakeStartedAt.current) * SHAKE_DECAY)
    camera.position.x += (Math.random() - 0.5) * amplitude
    camera.position.y += (Math.random() - 0.5) * amplitude
  })

  return null
}
