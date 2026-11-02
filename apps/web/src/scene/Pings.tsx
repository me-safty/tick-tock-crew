import { type ThreeEvent, useFrame } from "@react-three/fiber"
import { useRef } from "react"
import type { Group } from "three"
import type { BombTarget, Ping } from "../pings"
import { FACE, type Rect } from "./layout"
import { CLICK_SLOP_PX } from "./look"
import { usePrefersReducedMotion } from "./motion"
import { type ModuleShape, targetAt, targetRect } from "./pingTargets"

const ROLE_COLOR = {
  operator: "#f5a524",
  analyst: "#4cc3e6",
  scanner: "#8bd450",
} as const satisfies Record<Ping["fromRole"], string>

// In front of every part on the face, so a ping click lands here before it can cut a wire or press a key.
const SURFACE_Z = 0.16
const FRAME_Z = 0.13

/**
 * Pings on the bomb's face: a right-click points at the part under the pointer, and so does a left click while
 * `pinging`. Shows each role's newest ping as a frame in its color.
 */
export function PingLayer({
  modules,
  pings,
  pinging,
  onPing,
}: {
  readonly modules: ReadonlyArray<ModuleShape>
  readonly pings: ReadonlyArray<{ readonly fromRole: Ping["fromRole"]; readonly target: BombTarget }>
  readonly pinging: boolean
  readonly onPing: (target: BombTarget) => void
}) {
  const ping = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > CLICK_SLOP_PX) return
    const target = targetAt(modules, event.object.worldToLocal(event.point.clone()))
    if (target) onPing(target)
  }
  return (
    <>
      <mesh
        position={[0, 0, SURFACE_Z]}
        onContextMenu={(event) => {
          event.nativeEvent.preventDefault()
          ping(event)
        }}
        {...(pinging ? { onClick: ping } : {})}
      >
        <planeGeometry args={[FACE.width, FACE.height]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {pings.map(({ fromRole, target }) => (
        <PingFrame key={fromRole} rect={targetRect(modules, target)} color={ROLE_COLOR[fromRole]} />
      ))}
    </>
  )
}

const LINE = 0.01

function PingFrame({ rect, color }: { readonly rect: Rect; readonly color: string }) {
  const group = useRef<Group>(null)
  const reducedMotion = usePrefersReducedMotion()
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return
    const scale = 1 + 0.05 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 7))
    group.current.scale.set(scale, scale, 1)
  })
  const { width, height } = rect
  const bars = [
    { x: 0, y: height / 2, w: width + LINE, h: LINE },
    { x: 0, y: -height / 2, w: width + LINE, h: LINE },
    { x: -width / 2, y: 0, w: LINE, h: height },
    { x: width / 2, y: 0, w: LINE, h: height },
  ]
  return (
    <group ref={group} position={[rect.x, rect.y, FRAME_Z]}>
      <mesh renderOrder={9}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} depthTest={false} toneMapped={false} />
      </mesh>
      {bars.map(({ x, y, w, h }, i) => (
        <mesh key={i} position={[x, y, 0]} renderOrder={10}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
        </mesh>
      ))}
      {/* A pin above the frame, pointing down at it. */}
      <mesh position={[0, height / 2 + 0.04, 0]} rotation={[0, 0, -Math.PI / 2]} renderOrder={10}>
        <circleGeometry args={[0.028, 3]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
