import { Canvas } from "@react-three/fiber"
import type { RefObject } from "react"
import type { Match, OperatorAction } from "../roles"
import { Bomb } from "./Bomb"
import { Booth } from "./Booth"
import { type DialControl, OperatorDial, ScannerDial } from "./Dial"
import { Finale } from "./Finale"
import { BOMB_POSITION } from "./layout"
import type { Seat } from "./look"
import { usePrefersReducedMotion } from "./motion"
import { SeatCamera } from "./SeatCamera"
import { OperatorKeypad, ScannerKeypad } from "./Keypad"
import { OperatorValve, ScannerValve, type ValveControl } from "./Valve"
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
  /** The Operator's action waiting on the server; the bomb takes no other until it settles. */
  readonly pending: OperatorAction | null
  readonly onAct: (action: OperatorAction) => void
  readonly dial: DialControl
  readonly valve: ValveControl
  /** Server time minus local time, for the Scanner's gauge. */
  readonly clockOffset: RefObject<number>
  readonly onOpenManual: () => void
}

/** The 3D view from the player's seat. Each role only gets the props its view carries. */
export function Scene({ match, finale, ...roleProps }: SceneProps) {
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
      <RoleSet match={match} {...roleProps} />
      {/* three.js recompiles every lit material when the point-light count changes, so the finale's flash replaces an idle light. */}
      {ending ? <Finale outcome={ending} origin={view && view.role !== "analyst" ? BOMB_POSITION : null} /> : <pointLight intensity={0} />}
    </Canvas>
  )
}

function RoleSet({ match, pending, onAct, dial, valve, clockOffset, onOpenManual }: Omit<SceneProps, "finale">) {
  const view = match.view
  if (!view) return <Workshop />
  const exploded = match.status === "lost"
  const locked = pending !== null || match.status !== "playing"
  switch (view.role) {
    case "operator":
      return (
        <>
          <Workshop />
          {!exploded && (
            <Bomb view={view} match={match}>
              {view.modules.map((module, index) => {
                switch (module.kind) {
                  case "wires":
                    return (
                      <OperatorWires
                        key={index}
                        index={index}
                        module={module}
                        pending={pending?.kind === "cut" && pending.module === index ? pending.wire : null}
                        locked={locked}
                        onCut={(wire) => onAct({ kind: "cut", module: index, wire })}
                      />
                    )
                  case "keypad":
                    return (
                      <OperatorKeypad
                        key={index}
                        index={index}
                        module={module}
                        pending={pending?.kind === "press" && pending.module === index ? pending.key : null}
                        locked={locked}
                        onPress={(key) => onAct({ kind: "press", module: index, key })}
                      />
                    )
                  case "dial":
                    return (
                      <OperatorDial
                        key={index}
                        index={index}
                        module={module}
                        dial={dial}
                        locked={locked}
                        onSend={() => onAct({ kind: "tune", module: index, frequency: dial.frequency })}
                      />
                    )
                  case "valve":
                    return <OperatorValve key={index} index={index} module={module} valve={valve} />
                  default: {
                    const _exhaustive: never = module
                    return _exhaustive
                  }
                }
              })}
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
              {view.modules.map((module, index) => {
                switch (module.kind) {
                  case "wires":
                    return <ScannerWires key={index} index={index} module={module} />
                  case "keypad":
                    return <ScannerKeypad key={index} index={index} module={module} />
                  case "dial":
                    return <ScannerDial key={index} index={index} module={module} />
                  case "valve":
                    return <ScannerValve key={index} index={index} module={module} clockOffset={clockOffset} />
                  default: {
                    const _exhaustive: never = module
                    return _exhaustive
                  }
                }
              })}
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
