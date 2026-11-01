import { RoundedBox, useCursor } from "@react-three/drei"
import { type ThreeEvent, useFrame } from "@react-three/fiber"
import { isHeld, MAX_PRESSURE, pressureAt } from "@tick-tock-crew/rules"
import { type RefObject, useEffect, useMemo, useRef, useState } from "react"
import { Curve, type Group, MathUtils, type Mesh, type MeshBasicMaterial, TubeGeometry, Vector3 } from "three"
import type { ViewOf } from "../roles"
import { createCanvasTexture, MONO_FONT, SANS_FONT, useDrawnTexture, useLabelText } from "./labels"
import { slotRect } from "./layout"
import { HOVER, Ink, INK, Paint, Toon, XRAY } from "./materials"
import { usePrefersReducedMotion } from "./motion"
import { COLOR_HEX } from "./Wires"

type OperatorModule = Extract<ViewOf<"operator">["modules"][number], { kind: "valve" }>
type ScannerModule = Extract<ViewOf<"scanner">["modules"][number], { kind: "valve" }>

export type HoldSource = "pointer" | "key"

/** The Operator's grip on the valve, shared by the 3D handle and the keyboard control in the HUD. */
export type ValveControl = {
  readonly armed: boolean
  readonly held: boolean
  readonly focused: boolean
  readonly press: (by: HoldSource) => void
  readonly letGo: () => void
  readonly focus: () => void
}

/** Slot-local layout: a pipe across the left half with the handle on its bonnet; the right half holds the vent or the gauge. */
const PIPE = { from: -0.27, to: -0.03, y: 0, z: 0.05, radius: 0.045 }
const WHEEL = { x: -0.15, y: 0, z: 0.14, radius: 0.085, tube: 0.013 }
const PUSHED_IN = 0.02
const SPIN_PER_SECOND = 2.4
const STEEL = "#c9d1d9"

function ValveBody() {
  const length = PIPE.to - PIPE.from
  const middle = (PIPE.from + PIPE.to) / 2
  return (
    <group>
      <mesh position={[middle, PIPE.y, PIPE.z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[PIPE.radius, PIPE.radius, length, 28]} />
        <Paint color="#8a939f" />
        <Ink thickness={0.004} />
      </mesh>
      {[PIPE.from, PIPE.to].map((x) => (
        <mesh key={x} position={[x, PIPE.y, PIPE.z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[PIPE.radius * 1.35, PIPE.radius * 1.35, 0.018, 28]} />
          <Paint color={STEEL} />
          <Ink thickness={0.004} />
        </mesh>
      ))}
      <mesh position={[WHEEL.x, WHEEL.y, (PIPE.z + WHEEL.z) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.026, 0.032, WHEEL.z - PIPE.z, 20]} />
        <Paint color={STEEL} />
        <Ink thickness={0.004} />
      </mesh>
    </group>
  )
}

const SPOKES = [0, Math.PI / 2]

function Wheel({ color = STEEL, glow = false }: { readonly color?: string; readonly glow?: boolean }) {
  return (
    <group>
      <mesh>
        <torusGeometry args={[WHEEL.radius, WHEEL.tube, 14, 48]} />
        <Paint color={color} emissive={glow ? HOVER : "#000000"} emissiveIntensity={0.3} />
        {glow ? <Ink thickness={0.009} color={HOVER} /> : <Ink thickness={0.004} />}
      </mesh>
      {SPOKES.map((angle) => (
        <mesh key={angle} rotation={[0, 0, angle]}>
          <boxGeometry args={[WHEEL.radius * 2, 0.016, 0.012]} />
          <Paint color={color} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.024, 0.024, 0.026, 20]} />
        <Paint color={INK} />
      </mesh>
    </group>
  )
}

export function OperatorValve({
  index,
  module,
  valve,
}: {
  readonly index: number
  readonly module: OperatorModule
  readonly valve: ValveControl
}) {
  const rect = slotRect(index)
  return (
    <group position={[rect.x, rect.y, 0]}>
      <ValveBody />
      <Handle color={COLOR_HEX[module.handle]} valve={valve} />
      {/* Steam follows the server's word that the valve is venting, not the local press. */}
      <Vent venting={module.held} />
      <HoldLabel dim={module.solved} />
    </group>
  )
}

function Handle({ color, valve }: { readonly color: string; readonly valve: ValveControl }) {
  const reducedMotion = usePrefersReducedMotion()
  const [hovered, setHovered] = useState(false)
  const group = useRef<Group>(null)
  const stopHold = useRef<(() => void) | null>(null)
  useEffect(() => () => stopHold.current?.(), [])
  useCursor(hovered && valve.armed, valve.held ? "grabbing" : "grab")

  useFrame((_, delta) => {
    if (!group.current) return
    const depth = valve.held ? PUSHED_IN : 0
    group.current.position.z = MathUtils.damp(group.current.position.z, WHEEL.z - depth, 18, delta)
    if (valve.held && !reducedMotion) group.current.rotation.z -= SPIN_PER_SECOND * delta
  })

  const grab = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (!valve.armed) return
    const { pointerId } = event.nativeEvent
    // Window capture runs before the seat camera's listener, so holding the handle keeps the view still.
    const block = (moved: PointerEvent) => {
      if (moved.pointerId === pointerId) moved.stopImmediatePropagation()
    }
    const release = (released: PointerEvent) => {
      if (released.pointerId !== pointerId) return
      stop()
      valve.letGo()
      valve.focus()
    }
    const stop = () => {
      window.removeEventListener("pointermove", block, true)
      window.removeEventListener("pointerup", release, true)
      window.removeEventListener("pointercancel", release, true)
      stopHold.current = null
    }
    stopHold.current?.()
    stopHold.current = stop
    window.addEventListener("pointermove", block, true)
    window.addEventListener("pointerup", release, true)
    window.addEventListener("pointercancel", release, true)
    valve.press("pointer")
  }

  return (
    <group ref={group} position={[WHEEL.x, WHEEL.y, WHEEL.z]}>
      {valve.focused && valve.armed && (
        <mesh position={[0, 0, -0.012]}>
          <ringGeometry args={[WHEEL.radius + 0.02, WHEEL.radius + 0.028, 48]} />
          <meshBasicMaterial color={HOVER} toneMapped={false} />
        </mesh>
      )}
      <group
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onPointerDown={grab}
      >
        <Wheel color={color} glow={hovered && valve.armed} />
        {/* An invisible disc fills the spokes' gaps, so the whole wheel takes the press. */}
        <mesh>
          <circleGeometry args={[WHEEL.radius + WHEEL.tube, 32]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

const NOZZLE = { x: 0.06, y: 0.03 }
const PUFFS = 5
const PUFF_RISE = 0.13

/** A stub on top of the case that puffs steam while the valve vents. */
function Vent({ venting }: { readonly venting: boolean }) {
  const reducedMotion = usePrefersReducedMotion()
  const puffs = useRef<Array<Mesh | null>>([])
  const inks = useRef<Array<MeshBasicMaterial | null>>([])
  const strength = useRef(0)
  useFrame(({ clock }, delta) => {
    strength.current = MathUtils.damp(strength.current, venting ? 1 : 0, 6, delta)
    for (const [i, puff] of puffs.current.entries()) {
      const ink = inks.current[i]
      if (!puff || !ink) continue
      const phase = reducedMotion ? 0.35 : (clock.elapsedTime * 0.9 + i / PUFFS) % 1
      puff.position.set(Math.sin(phase * 5 + i) * 0.012, 0.05 + phase * PUFF_RISE, 0)
      puff.scale.setScalar(0.012 + phase * 0.03)
      ink.opacity = strength.current * (1 - phase) * 0.75
      puff.visible = ink.opacity > 0.01
    }
  })
  return (
    <group position={[NOZZLE.x, NOZZLE.y, 0.03]}>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.02, 0.026, 0.07, 18]} />
        <Paint color="#8a939f" />
        <Ink thickness={0.004} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.012, 18]} />
        <Paint color={STEEL} />
        <Ink thickness={0.004} />
      </mesh>
      {Array.from({ length: PUFFS }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            puffs.current[i] = mesh
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial
            ref={(material) => {
              inks.current[i] = material
            }}
            color="#f4f7fb"
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

const LABEL = { x: 0.17, y: -0.085, width: 0.2, height: 0.05 }

function HoldLabel({ dim }: { readonly dim: boolean }) {
  const { t, direction, key } = useLabelText()
  const texture = useDrawnTexture({
    width: 400,
    height: 100,
    key: `${key}|${dim}`,
    draw: (context, { width, height }) => {
      context.fillStyle = dim ? "#5f6670" : "#e9b53f"
      context.beginPath()
      context.roundRect(4, 4, width - 8, height - 8, 16)
      context.fill()
      context.direction = direction
      context.font = `800 ${direction === "rtl" ? 48 : 42}px ${SANS_FONT}`
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.fillStyle = INK
      context.fillText(t("scene.holdToVent"), width / 2, height / 2 + 3, width - 40)
    },
  })
  return (
    <mesh position={[LABEL.x, LABEL.y, 0.01]}>
      <planeGeometry args={[LABEL.width, LABEL.height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  )
}

const SPRING = { from: -0.255, to: -0.045, radius: 0.033, tube: 0.006, lean: 0.7 }

/** A coil spring along the pipe. Each turn leans sideways, so seen from the front it reads as a loop to count. */
class SpringCurve extends Curve<Vector3> {
  readonly coils: number
  constructor(coils: number) {
    super()
    this.coils = coils
  }
  override getPoint(t: number, target = new Vector3()) {
    const angle = t * this.coils * Math.PI * 2
    const depth = Math.sin(angle) * SPRING.radius
    return target.set(MathUtils.lerp(SPRING.from, SPRING.to, t) + depth * SPRING.lean, Math.cos(angle) * SPRING.radius, depth)
  }
}

function Spring({ coils }: { readonly coils: number }) {
  const geometry = useMemo(() => new TubeGeometry(new SpringCurve(coils), coils * 64, SPRING.tube, 8, false), [coils])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={[0, PIPE.y, PIPE.z]} renderOrder={2}>
      <primitive object={XRAY.core} attach="material" />
    </mesh>
  )
}

/** Under the X-ray lens the Scanner sees the valve's spring and its live pressure gauge. */
export function ScannerValve({
  index,
  module,
  clockOffset,
}: {
  readonly index: number
  readonly module: ScannerModule
  readonly clockOffset: RefObject<number>
}) {
  const rect = slotRect(index)
  return (
    <group position={[rect.x, rect.y, 0]}>
      <ValveBody />
      <group position={[WHEEL.x, WHEEL.y, WHEEL.z]}>
        <Wheel />
      </group>
      <Spring coils={module.coils} />
      <PressureGauge module={module} clockOffset={clockOffset} />
    </group>
  )
}

const GAUGE = { x: 0.12, y: 0.035, radius: 0.1 }
const GAUGE_PX = 512
const SWEEP_DEGREES = 270
const DANGER_FROM = 90
const READOUT = { x: 0.12, y: -0.105, width: 0.15, height: 0.056 }
const LAMP = { x: -0.005, y: -0.105 }

/** Where the needle points for `pressure`, in radians from +x: 0 at lower left, MAX_PRESSURE at lower right. */
const needleAngle = (pressure: number) => MathUtils.degToRad(225 - (pressure / MAX_PRESSURE) * SWEEP_DEGREES)

function drawGaugeFace(context: CanvasRenderingContext2D, { width }: { width: number }) {
  const center = width / 2
  const radius = width / 2 - 10
  const at = (pressure: number, r: number) => {
    const angle = needleAngle(pressure)
    return [center + Math.cos(angle) * r, center - Math.sin(angle) * r] as const
  }
  context.fillStyle = "rgba(4, 28, 22, 0.92)"
  context.strokeStyle = "#3fe0b0"
  context.lineWidth = 8
  context.beginPath()
  context.arc(center, center, radius, 0, Math.PI * 2)
  context.fill()
  context.stroke()

  context.strokeStyle = "rgba(255, 107, 90, 0.85)"
  context.lineWidth = 22
  context.beginPath()
  context.arc(center, center, radius - 34, -needleAngle(DANGER_FROM), -needleAngle(MAX_PRESSURE))
  context.stroke()

  context.strokeStyle = "#d9fff2"
  context.lineCap = "round"
  for (let pressure = 0; pressure <= MAX_PRESSURE; pressure += 5) {
    const major = pressure % 10 === 0
    context.lineWidth = major ? 7 : 3
    context.beginPath()
    context.moveTo(...at(pressure, radius - 22))
    context.lineTo(...at(pressure, radius - (major ? 62 : 44)))
    context.stroke()
  }
  context.fillStyle = "#d9fff2"
  context.font = `700 64px ${MONO_FONT}`
  context.direction = "ltr"
  context.textAlign = "center"
  context.textBaseline = "middle"
  for (const pressure of [0, MAX_PRESSURE / 2, MAX_PRESSURE]) context.fillText(String(pressure), ...at(pressure, radius - 112))
}

function PressureGauge({ module, clockOffset }: { readonly module: ScannerModule; readonly clockOffset: RefObject<number> }) {
  const face = useDrawnTexture({ width: GAUGE_PX, height: GAUGE_PX, key: "face", draw: drawGaugeFace })
  const readout = useMemo(() => createCanvasTexture({ width: 288, height: 104 }), [])
  useEffect(() => () => readout.texture.dispose(), [readout])
  const needle = useRef<Group>(null)
  const shown = useRef("")
  const { gauge, since, events, solved } = module
  const progress = useMemo(() => ({ since, events }), [since, events])
  const venting = useMemo(() => !solved && isHeld(gauge, progress), [gauge, progress, solved])
  // A defused valve stays where it was sealed.
  const frozenAt = solved ? events.at(-1)?.at : undefined

  useFrame((_, delta) => {
    const pressure = pressureAt(gauge, progress, frozenAt ?? Date.now() + clockOffset.current)
    if (needle.current) {
      // Late news of a hold or a reset makes the reading jump; a quick ease keeps the needle readable.
      needle.current.rotation.z = MathUtils.damp(needle.current.rotation.z, needleAngle(pressure) - Math.PI / 2, 22, delta)
    }
    const value = Math.round(pressure)
    const color = solved ? "#46e08a" : value >= DANGER_FROM ? "#ff6b5a" : "#ffb347"
    const key = `${value}|${color}`
    if (key === shown.current) return
    shown.current = key
    readout.draw((context, { width, height }) => {
      context.fillStyle = "#120d06"
      context.beginPath()
      context.roundRect(0, 0, width, height, 14)
      context.fill()
      context.font = `700 84px ${MONO_FONT}`
      context.direction = "ltr"
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.shadowColor = color
      context.shadowBlur = 18
      context.fillStyle = color
      context.fillText(String(value), width / 2, height / 2 + 5)
    })
  })

  return (
    <group position={[0, 0, 0.03]}>
      <mesh position={[GAUGE.x, GAUGE.y, 0]} renderOrder={2}>
        <planeGeometry args={[GAUGE.radius * 2, GAUGE.radius * 2]} />
        <meshBasicMaterial map={face} transparent depthTest={false} toneMapped={false} />
      </mesh>
      <group ref={needle} position={[GAUGE.x, GAUGE.y, 0]} rotation={[0, 0, needleAngle(gauge.start) - Math.PI / 2]}>
        <mesh position={[0, GAUGE.radius * 0.36, 0]} renderOrder={3}>
          <planeGeometry args={[0.014, GAUGE.radius * 0.84]} />
          <meshBasicMaterial color="#ffd166" transparent depthTest={false} toneMapped={false} />
        </mesh>
        <mesh renderOrder={3}>
          <circleGeometry args={[0.012, 20]} />
          <meshBasicMaterial color="#d9fff2" transparent depthTest={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[READOUT.x, READOUT.y, 0]} renderOrder={2}>
        <planeGeometry args={[READOUT.width, READOUT.height]} />
        <meshBasicMaterial map={readout.texture} transparent depthTest={false} toneMapped={false} />
      </mesh>
      <VentLamp venting={venting} />
    </group>
  )
}

/** Lights while the Operator holds the valve open, so the Scanner knows to watch for the band. */
function VentLamp({ venting }: { readonly venting: boolean }) {
  const { t, direction, key } = useLabelText()
  const label = useDrawnTexture({
    width: 160,
    height: 56,
    key,
    draw: (context, { width, height }) => {
      context.direction = direction
      context.font = `700 ${direction === "rtl" ? 36 : 32}px ${SANS_FONT}`
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.fillStyle = "#7fb8a6"
      context.fillText(t("scene.vent"), width / 2, height / 2 + 2)
    },
  })
  return (
    <group position={[LAMP.x, LAMP.y, 0]}>
      <mesh position={[0, 0.016, 0]} renderOrder={2}>
        <circleGeometry args={[0.018, 24]} />
        <meshBasicMaterial color={venting ? "#ffb347" : "#5a4420"} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.017, 0]} renderOrder={2}>
        <planeGeometry args={[0.08, 0.028]} />
        <meshBasicMaterial map={label} transparent depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
