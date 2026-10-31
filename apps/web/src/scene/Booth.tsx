import { RoundedBox, useCursor } from "@react-three/drei"
import { Suspense, useState } from "react"
import { SANS_FONT, useDrawnTexture } from "./labels"
import { Ink, Toon } from "./materials"
import { Prop } from "./Props"

export const DESK_TOP_Y = 0.768
const BOOTH = { width: 3.4, depth: 3.2, height: 2.8, backZ: -0.95 }

/** The Analyst's booth, away from the bomb: a desk, the manual, and a radio to the crew. */
export function Booth({ onOpenManual }: { readonly onOpenManual: () => void }) {
  return (
    <group>
      <BoothRoom />
      <Corkboard position={[0.35, 1.62, BOOTH.backZ + 0.03]} />
      <ManualBinder onOpen={onOpenManual} />
      <Mug position={[0.55, DESK_TOP_Y, 0.1]} />
      <pointLight position={[-0.55, 1.25, -0.35]} color="#ffd59a" intensity={2.2} distance={3} decay={1.6} />
      <Suspense fallback={null}>
        <Prop name="desk" position={[0, 0, -0.25]} />
        <Prop name="lampRoundTable" position={[-0.55, DESK_TOP_Y, -0.45]} rotation={[0, 0.6, 0]} />
        <Prop name="radio" position={[0.45, DESK_TOP_Y, -0.5]} rotation={[0, -0.35, 0]} />
        <Prop name="books" position={[-0.15, DESK_TOP_Y, -0.6]} />
        <Prop name="plantSmall1" position={[0.7, DESK_TOP_Y, -0.55]} />
        <Prop name="bookcaseOpen" position={[-1.4, 0, -0.55]} rotation={[0, Math.PI / 2, 0]} />
        <Prop name="books" position={[-1.4, 0.96, -0.6]} rotation={[0, Math.PI / 2, 0]} />
        <Prop name="pottedPlant" position={[1.3, 0, -0.65]} />
      </Suspense>
    </group>
  )
}

function BoothRoom() {
  const { width, depth, height, backZ } = BOOTH
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, backZ + depth / 2]}>
        <planeGeometry args={[width, depth]} />
        <Toon color="#3d3029" />
      </mesh>
      {[
        { position: [0, height / 2, backZ], rotation: 0, span: width },
        { position: [-width / 2, height / 2, backZ + depth / 2], rotation: Math.PI / 2, span: depth },
        { position: [width / 2, height / 2, backZ + depth / 2], rotation: -Math.PI / 2, span: depth },
      ].map(({ position: [x = 0, y = 0, z = 0], rotation, span }) => (
        <group key={rotation} position={[x, y, z]} rotation={[0, rotation, 0]}>
          <mesh>
            <planeGeometry args={[span, height]} />
            <Toon color="#2f4a42" />
          </mesh>
          <mesh position={[0, -height / 2 + 0.45, 0.02]}>
            <boxGeometry args={[span, 0.9, 0.04]} />
            <Toon color="#24392f" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const BINDER = { width: 0.44, depth: 0.58, thickness: 0.06 }

/** The manual on the desk. Clicking it opens the readable copy over the scene. */
function ManualBinder({ onOpen }: { readonly onOpen: () => void }) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const cover = useDrawnTexture({
    width: 440,
    height: 580,
    key: "cover",
    draw: (context, { width, height }) => {
      context.fillStyle = "#f26b3a"
      context.fillRect(0, 0, width, height)
      context.fillStyle = "#1d2029"
      context.fillRect(0, 70, width, 150)
      context.fillStyle = "#f5e9d4"
      context.textAlign = "center"
      context.font = `800 58px ${SANS_FONT}`
      context.fillText("FIELD", width / 2, 140)
      context.fillText("MANUAL", width / 2, 200)
      context.fillStyle = "#1d2029"
      context.font = `700 30px ${SANS_FONT}`
      context.fillText("TICK TOCK CREW", width / 2, 300)
      context.font = `600 26px ${SANS_FONT}`
      context.fillText("Analysts only", width / 2, height - 60)
    },
  })
  return (
    <group
      position={[0, DESK_TOP_Y + BINDER.thickness / 2, 0.12]}
      rotation={[0, -0.12, 0]}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
    >
      <RoundedBox args={[BINDER.width, BINDER.thickness, BINDER.depth]} radius={0.012}>
        <Toon color="#f26b3a" emissive={hovered ? "#ff9a5c" : "#000000"} emissiveIntensity={0.4} />
        <Ink thickness={hovered ? 0.01 : 0.006} />
      </RoundedBox>
      <mesh position={[0.012, 0, 0]}>
        <boxGeometry args={[BINDER.width - 0.02, BINDER.thickness - 0.016, BINDER.depth - 0.03]} />
        <Toon color="#f5efe2" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BINDER.thickness / 2 + 0.001, 0]}>
        <planeGeometry args={[BINDER.width - 0.02, BINDER.depth - 0.02]} />
        <meshBasicMaterial map={cover} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Mug({ position }: { readonly position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.05, 0.045, 0.12, 20]} />
        <Toon color="#4cc3e6" />
        <Ink thickness={0.005} />
      </mesh>
      <mesh position={[0.055, 0.065, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.03, 0.01, 8, 16, Math.PI]} />
        <Toon color="#4cc3e6" />
      </mesh>
    </group>
  )
}

const NOTES = [
  { x: -0.38, y: 0.12, color: "#f5d90a", tilt: 0.08 },
  { x: -0.05, y: 0.18, color: "#8bd450", tilt: -0.05 },
  { x: 0.3, y: 0.1, color: "#ffffff", tilt: 0.04 },
  { x: -0.25, y: -0.18, color: "#4cc3e6", tilt: -0.1 },
  { x: 0.2, y: -0.2, color: "#f5a524", tilt: 0.06 },
] as const

function Corkboard({ position }: { readonly position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.2, 0.8, 0.04]} radius={0.015}>
        <Toon color="#b88a5a" />
        <Ink thickness={0.008} />
      </RoundedBox>
      {NOTES.map(({ x, y, color, tilt }) => (
        <group key={`${x},${y}`} position={[x, y, 0.025]} rotation={[0, 0, tilt]}>
          <mesh>
            <planeGeometry args={[0.22, 0.2]} />
            <Toon color={color} />
          </mesh>
          <mesh position={[0, 0.07, 0.01]}>
            <sphereGeometry args={[0.014, 10, 8]} />
            <Toon color="#e5484d" />
          </mesh>
        </group>
      ))}
    </group>
  )
}
