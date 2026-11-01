import { RoundedBox, useCursor } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Glyph } from "@tick-tock-crew/rules"
import { type ReactNode, useRef, useState } from "react"
import { type Group, MathUtils, type Mesh } from "three"
import { GLYPH_BOX, GLYPH_STROKE, glyphPath } from "../glyphs"
import type { ViewOf } from "../roles"
import { useDrawnTexture } from "./labels"
import { slotRect } from "./layout"
import { CLICK_SLOP_PX } from "./look"
import { HOVER, Ink, INK, Paint, Toon, XRAY } from "./materials"
import { usePrefersReducedMotion } from "./motion"
import { SlotNumber } from "./Wires"

type OperatorModule = Extract<ViewOf<"operator">["modules"][number], { kind: "keypad" }>
type ScannerModule = Extract<ViewOf<"scanner">["modules"][number], { kind: "keypad" }>

const KEY_SIZE = 0.105
const KEY_DEPTH = 0.04
const KEY_PITCH = 0.13
const KEY_Y = 0.02
const PRESSED_DEPTH = 0.022
const NUMBER_Y = -0.1

const keyX = (key: number, count: number) => (key - (count - 1) / 2) * KEY_PITCH

/** A key that sinks into the case once pressed. */
function KeyCap({ pressed, children }: { readonly pressed: boolean; readonly children: ReactNode }) {
  const group = useRef<Group>(null)
  const sink = useRef(pressed ? 1 : 0)
  useFrame((_, delta) => {
    sink.current = MathUtils.damp(sink.current, pressed ? 1 : 0, 14, delta)
    if (group.current) group.current.position.z = KEY_DEPTH / 2 + 0.006 - sink.current * PRESSED_DEPTH
  })
  return <group ref={group}>{children}</group>
}

export function OperatorKeypad({
  index,
  module,
  pending,
  locked,
  onPress,
}: {
  readonly index: number
  readonly module: OperatorModule
  readonly pending: number | null
  readonly locked: boolean
  readonly onPress: (key: number) => void
}) {
  const rect = slotRect(index)
  const [hovered, setHovered] = useState<number | null>(null)
  const canPress = (key: number) => !locked && !module.solved && !module.keys[key]?.pressed
  useCursor(hovered !== null && canPress(hovered))
  return (
    <group position={[rect.x, rect.y, 0]}>
      {module.keys.map((key, i) => {
        const x = keyX(i, module.keys.length)
        const highlighted = hovered === i && canPress(i)
        return (
          <group key={i} position={[x, KEY_Y, 0]}>
            <KeyCap pressed={key.pressed || pending === i}>
              <RoundedBox
                args={[KEY_SIZE, KEY_SIZE, KEY_DEPTH]}
                radius={0.014}
                onPointerOver={(event) => {
                  event.stopPropagation()
                  setHovered(i)
                }}
                onPointerOut={() => setHovered((current) => (current === i ? null : current))}
                onClick={(event) => {
                  event.stopPropagation()
                  if (event.delta > CLICK_SLOP_PX || !canPress(i)) return
                  setHovered(null)
                  onPress(i)
                }}
              >
                <Toon color={key.pressed ? "#cfc5ae" : "#efe6d2"} emissive={highlighted ? HOVER : "#000000"} emissiveIntensity={0.3} />
                {highlighted ? <Ink thickness={0.009} color={HOVER} /> : <Ink thickness={0.004} />}
              </RoundedBox>
              <GlyphFace glyph={key.glyph} dim={key.pressed} />
            </KeyCap>
            <PressedLamp pressed={key.pressed} />
            <SlotNumber number={i + 1} x={0} y={NUMBER_Y - KEY_Y} />
          </group>
        )
      })}
    </group>
  )
}

function GlyphFace({ glyph, dim }: { readonly glyph: Glyph; readonly dim: boolean }) {
  const texture = useDrawnTexture({
    width: 128,
    height: 128,
    key: `${glyph.frame}|${glyph.mark}|${dim}`,
    draw: (context, { width }) => {
      const scale = width / GLYPH_BOX
      context.scale(scale * 0.8, scale * 0.8)
      context.translate(GLYPH_BOX * 0.125, GLYPH_BOX * 0.125)
      context.strokeStyle = dim ? "#5d5a52" : INK
      context.lineWidth = GLYPH_STROKE
      context.lineCap = "round"
      context.lineJoin = "round"
      context.stroke(new Path2D(glyphPath(glyph)))
    },
  })
  return (
    <mesh position={[0, 0, KEY_DEPTH / 2 + 0.001]}>
      <planeGeometry args={[KEY_SIZE * 0.9, KEY_SIZE * 0.9]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  )
}

/** Lights green above each key once it has been pressed in turn. */
function PressedLamp({ pressed }: { readonly pressed: boolean }) {
  return (
    <mesh position={[0, KEY_SIZE / 2 + 0.03, 0.008]} scale={[1, 1, 0.5]}>
      <sphereGeometry args={[0.009, 12, 8]} />
      {pressed ? <meshBasicMaterial color="#46e08a" toneMapped={false} /> : <Paint color="#1d3a2a" />}
    </mesh>
  )
}

/** Under the X-ray lens, each key's contact shows; the live one glows and pulses. */
export function ScannerKeypad({ index, module }: { readonly index: number; readonly module: ScannerModule }) {
  const rect = slotRect(index)
  return (
    <group position={[rect.x, rect.y, 0]}>
      {module.keys.map((key, i) => (
        <group key={i} position={[keyX(i, module.keys.length), KEY_Y, 0]}>
          <KeyCap pressed={key.pressed}>
            <RoundedBox args={[KEY_SIZE, KEY_SIZE, KEY_DEPTH]} radius={0.014}>
              <Paint />
            </RoundedBox>
          </KeyCap>
          <Contact live={key.live} pulsing={key.live && !module.solved} />
          <PressedLamp pressed={key.pressed} />
          <SlotNumber number={i + 1} x={0} y={NUMBER_Y - KEY_Y} color="#7fb8a6" />
        </group>
      ))}
    </group>
  )
}

function Contact({ live, pulsing }: { readonly live: boolean; readonly pulsing: boolean }) {
  const reducedMotion = usePrefersReducedMotion()
  const halo = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (!halo.current) return
    const pulse = reducedMotion ? 1 : 1 + 0.18 * Math.sin(clock.elapsedTime * 5)
    halo.current.scale.set(pulse, pulse, 1)
  })
  return (
    <group position={[0, 0, 0.012]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.008, 20]} />
        <primitive object={live ? XRAY.core : XRAY.part} attach="material" />
      </mesh>
      {pulsing && (
        <mesh ref={halo} position={[0, 0, 0.03]} renderOrder={2}>
          <ringGeometry args={[0.046, 0.056, 32]} />
          <meshBasicMaterial color="#c8fff0" transparent opacity={0.9} depthTest={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}
