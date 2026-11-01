import { Canvas } from "@react-three/fiber"
import type { Match, WireRef } from "../roles"
import { Bomb } from "./Bomb"
import { Booth } from "./Booth"
import { Finale } from "./Finale"
import { BOMB_POSITION } from "./layout"
import type { Seat } from "./look"
import { usePrefersReducedMotion } from "./motion"
import { SeatCamera } from "./SeatCamera"
import { OperatorWires, ScannerWires } from "./Wires"
import { Workshop } from "./Workshop"

const SEATS = {
  operator: { position: [0, 1.8, 2.05], target: [0, 1.3, 0.2], fov: 40, limits: { yaw: 0.9, pitch: 0.5 } },
  scanner: { position: [-1.3, 2.0, 1.8], target: [0, 1.3, 0.2], fov: 40, limits: { yaw: 0.8, pitch: 0.45 } },
  analyst: { position: [0, 1.62, 1.6], target: [0, 0.85, -0.2], fov: 44, limits: { yaw: 0.9, pitch: 0.45 } },
  spectator: { position: [2.6, 2.3, 3.4], target: [0, 1, 0], fov: 45, limits: { yaw: 0.6, pitch: 0.35 } },
} as const satisfies Record<string, Seat>

type SceneProps = {
  readonly match: Match
  /** Play the win or loss sequence; false when the match was already over on arrival. */
  readonly finale: boolean
  readonly pendingCut: WireRef | null
  readonly onCut: (ref: WireRef) => void
  readonly onOpenManual: () => void
}

/** The 3D view from the player's seat. Each role only gets the props its view carries. */
export function Scene({ match, finale, pendingCut, onCut, onOpenManual }: SceneProps) {
  const reducedMotion = usePrefersReducedMotion()
  const view = match.view
  const seat = SEATS[view?.role ?? "spectator"]
  const ending = finale && match.status !== "playing" ? match.status : null
  return (
    <Canvas className="scene" dpr={[1, 1.75]} camera={{ fov: seat.fov, near: 0.05, far: 40 }}>
      <color attach="background" args={["#11141c"]} />
      <fog attach="fog" args={["#11141c", 7, 16]} />
      <hemisphereLight args={["#cdd8ff", "#3a2c22", 1.15]} />
      <directionalLight position={[3, 5, 4]} intensity={1.5} color="#fff1dc" />
      <SeatCamera seat={seat} shaking={ending === "lost" && !reducedMotion} />
      <RoleSet match={match} pendingCut={pendingCut} onCut={onCut} onOpenManual={onOpenManual} />
      {/* three.js recompiles every lit material when the point-light count changes, so the finale's flash replaces an idle light. */}
      {ending ? <Finale outcome={ending} origin={view && view.role !== "analyst" ? BOMB_POSITION : null} /> : <pointLight intensity={0} />}
    </Canvas>
  )
}

function RoleSet({ match, pendingCut, onCut, onOpenManual }: Omit<SceneProps, "finale">) {
  const view = match.view
  if (!view) return <Workshop />
  const exploded = match.status === "lost"
  switch (view.role) {
    case "operator":
      return (
        <>
          <Workshop />
          {!exploded && (
            <Bomb view={view} match={match}>
              {view.modules.map((module, index) => (
                <OperatorWires
                  key={index}
                  index={index}
                  module={module}
                  pending={pendingCut?.module === index ? pendingCut.wire : null}
                  locked={pendingCut !== null || match.status !== "playing"}
                  onCut={onCut}
                />
              ))}
            </Bomb>
          )}
        </>
      )
    case "scanner":
      return (
        <>
          <Workshop />
          {!exploded && (
            <Bomb view={view} match={match}>
              {view.modules.map((module, index) => (
                <ScannerWires key={index} index={index} module={module} />
              ))}
            </Bomb>
          )}
        </>
      )
    case "analyst":
      return <Booth onOpenManual={onOpenManual} />
    default: {
      const _exhaustive: never = view
      return _exhaustive
    }
  }
}
