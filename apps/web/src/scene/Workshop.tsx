import { ContactShadows, RoundedBox } from "@react-three/drei"
import { Suspense } from "react"
import { useDrawnTexture } from "./labels"
import { TABLE_TOP_Y } from "./layout"
import { Ink, Toon } from "./materials"
import { Prop } from "./Props"

const TABLE = { width: 3.2, depth: 2, thickness: 0.08 }
const LEGS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const

const ROOM = { width: 8, depth: 7, height: 3.4, backZ: -3 }

/** The room the Operator and Scanner share: walls, a work table under a hanging lamp, and some furniture. */
export function Workshop() {
  return (
    <group>
      <Room />
      <WorkTable />
      <HangingLamp position={[0, 2.75, 0.1]} />
      <WireCutters />
      <ContactShadows position={[0, TABLE_TOP_Y + 0.002, 0]} scale={[TABLE.width, TABLE.depth]} far={1.2} blur={2.2} opacity={0.55} resolution={256} frames={1} />
      <Suspense fallback={null}>
        <Prop name="rugRectangle" position={[0, 0.001, 0.2]} scale={1.3} />
        <Prop name="radio" position={[-1.1, TABLE_TOP_Y, -0.35]} rotation={[0, 0.5, 0]} />
        <Prop name="bookcaseOpen" position={[-3.55, 0, -1.2]} rotation={[0, Math.PI / 2, 0]} scale={1.15} />
        <Prop name="books" position={[-3.55, 0.94, -1.25]} rotation={[0, Math.PI / 2, 0]} />
        <Prop name="books" position={[-3.55, 1.74, -0.85]} rotation={[0, Math.PI / 2, 0]} />
        <Prop name="cardboardBoxClosed" position={[2.9, 0, -2.4]} rotation={[0, 0.3, 0]} scale={1.4} />
        <Prop name="cardboardBoxClosed" position={[2.95, 0.79, -2.35]} rotation={[0, -0.2, 0]} scale={1.1} />
        <Prop name="cardboardBoxClosed" position={[2.1, 0, -2.55]} rotation={[0, 0.1, 0]} />
        <Prop name="lampSquareFloor" position={[-3.3, 0, -2.5]} />
        <Prop name="pottedPlant" position={[3.4, 0, 0.6]} />
      </Suspense>
    </group>
  )
}

function Room() {
  const { width, depth, height, backZ } = ROOM
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, backZ + depth / 2]}>
        <planeGeometry args={[width, depth]} />
        <Toon color="#4a3a31" />
      </mesh>
      <Wall position={[0, height / 2, backZ]} width={width} />
      <Wall position={[-width / 2, height / 2, backZ + depth / 2]} rotation={[0, Math.PI / 2, 0]} width={depth} />
      <Wall position={[width / 2, height / 2, backZ + depth / 2]} rotation={[0, -Math.PI / 2, 0]} width={depth} />
      <NightWindow position={[1.6, 1.85, backZ + 0.02]} />
      <Pegboard position={[-1.2, 1.75, backZ + 0.03]} />
    </group>
  )
}

function Wall({
  position,
  rotation = [0, 0, 0],
  width,
}: {
  readonly position: [number, number, number]
  readonly rotation?: [number, number, number]
  readonly width: number
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[width, ROOM.height]} />
        <Toon color="#2c3a57" />
      </mesh>
      <mesh position={[0, -ROOM.height / 2 + 0.5, 0.02]}>
        <boxGeometry args={[width, 1, 0.04]} />
        <Toon color="#23304a" />
      </mesh>
      <mesh position={[0, -ROOM.height / 2 + 1.02, 0.05]}>
        <boxGeometry args={[width, 0.05, 0.06]} />
        <Toon color="#3c4d70" />
      </mesh>
    </group>
  )
}

function WorkTable() {
  const legHeight = TABLE_TOP_Y - TABLE.thickness
  return (
    <group>
      <RoundedBox args={[TABLE.width, TABLE.thickness, TABLE.depth]} radius={0.025} position={[0, TABLE_TOP_Y - TABLE.thickness / 2, 0]}>
        <Toon color="#9a6a45" />
        <Ink thickness={0.014} />
      </RoundedBox>
      {LEGS.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x * (TABLE.width / 2 - 0.12), legHeight / 2, z * (TABLE.depth / 2 - 0.12)]}>
          <boxGeometry args={[0.1, legHeight, 0.1]} />
          <Toon color="#6e4a31" />
          <Ink />
        </mesh>
      ))}
    </group>
  )
}

function HangingLamp({ position }: { readonly position: [number, number, number] }) {
  const y = position[1]
  return (
    <group position={position}>
      <mesh position={[0, (ROOM.height - y) / 2 + 0.15, 0]}>
        <cylinderGeometry args={[0.008, 0.008, ROOM.height - y + 0.3, 6]} />
        <Toon color="#14161c" />
      </mesh>
      <mesh>
        <coneGeometry args={[0.32, 0.26, 24, 1, true]} />
        <Toon color="#3f8f7a" side={2} />
        <Ink thickness={0.01} />
      </mesh>
      <mesh position={[0, -0.1, 0]}>
        <sphereGeometry args={[0.07, 16, 12]} />
        <meshBasicMaterial color="#fff2c4" toneMapped={false} />
      </mesh>
      <pointLight position={[0, -0.2, 0]} color="#ffd9a0" intensity={7} distance={6} decay={1.4} />
    </group>
  )
}

/** Not interactive: the Operator cuts by clicking a wire. These just set the scene. */
function WireCutters() {
  return (
    <group position={[0.85, TABLE_TOP_Y + 0.02, 0.62]} rotation={[0, -0.6, 0]}>
      {[-1, 1].map((side) => (
        <group key={side} rotation={[0, side * 0.12, 0]}>
          <RoundedBox args={[0.36, 0.035, 0.05]} radius={0.016} position={[0.2, 0, side * 0.03]}>
            <Toon color="#e5484d" />
            <Ink thickness={0.006} />
          </RoundedBox>
          <mesh position={[-0.04, 0, side * 0.012]}>
            <boxGeometry args={[0.12, 0.03, 0.024]} />
            <Toon color="#9aa3ad" />
            <Ink thickness={0.004} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function NightWindow({ position }: { readonly position: [number, number, number] }) {
  const sky = useDrawnTexture({
    width: 256,
    height: 192,
    key: "night",
    draw: (context, { width, height }) => {
      const gradient = context.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, "#0b1430")
      gradient.addColorStop(1, "#27407a")
      context.fillStyle = gradient
      context.fillRect(0, 0, width, height)
      context.fillStyle = "#f6f0d0"
      context.beginPath()
      context.arc(width * 0.72, height * 0.3, 18, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = "rgba(255,255,255,0.8)"
      for (const [sx, sy] of [
        [30, 40],
        [80, 22],
        [120, 70],
        [60, 110],
        [210, 120],
        [150, 30],
      ] as const) {
        context.fillRect(sx, sy, 3, 3)
      }
      context.fillStyle = "#0a0f1f"
      context.fillRect(0, height * 0.78, width, height * 0.22)
      for (const [bx, bw, bh] of [
        [10, 40, 50],
        [60, 30, 70],
        [100, 50, 40],
        [170, 36, 80],
        [215, 40, 55],
      ] as const) {
        context.fillRect(bx, height - bh, bw, bh)
      }
    },
  })
  return (
    <group position={position}>
      <RoundedBox args={[1.5, 1.15, 0.08]} radius={0.03}>
        <Toon color="#e8e1d2" />
      </RoundedBox>
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[1.32, 0.97]} />
        <meshBasicMaterial map={sky} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[0.04, 0.97, 0.02]} />
        <Toon color="#e8e1d2" />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[1.32, 0.04, 0.02]} />
        <Toon color="#e8e1d2" />
      </mesh>
    </group>
  )
}

const PEGS = Array.from({ length: 6 * 4 }, (_, i) => [(i % 6) - 2.5, Math.floor(i / 6) - 1.5] as const)

function Pegboard({ position }: { readonly position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.6, 1.0, 0.04]} radius={0.015}>
        <Toon color="#c79a62" />
        <Ink thickness={0.008} />
      </RoundedBox>
      {PEGS.map(([x, y]) => (
        <mesh key={`${x},${y}`} position={[x * 0.24, y * 0.22, 0.022]}>
          <circleGeometry args={[0.012, 8]} />
          <Toon color="#7a5a36" />
        </mesh>
      ))}
      <RoundedBox args={[0.08, 0.44, 0.03]} radius={0.012} position={[-0.5, 0.05, 0.05]} rotation={[0, 0, 0.12]}>
        <Toon color="#3e7bfa" />
      </RoundedBox>
      <RoundedBox args={[0.36, 0.08, 0.03]} radius={0.012} position={[0.05, 0.28, 0.05]}>
        <Toon color="#9aa3ad" />
      </RoundedBox>
      <mesh position={[0.45, -0.1, 0.05]}>
        <torusGeometry args={[0.13, 0.025, 8, 24]} />
        <Toon color="#f5a524" />
      </mesh>
      <RoundedBox args={[0.24, 0.12, 0.05]} radius={0.02} position={[0.05, -0.25, 0.05]}>
        <Toon color="#30a46c" />
      </RoundedBox>
    </group>
  )
}
