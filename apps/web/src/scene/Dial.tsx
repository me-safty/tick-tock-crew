import { RoundedBox, useCursor } from "@react-three/drei"
import type { ThreeEvent } from "@react-three/fiber"
import { DIAL_RANGE, type Waveform } from "@tick-tock-crew/rules"
import { useEffect, useRef, useState } from "react"
import { MathUtils } from "three"
import type { ViewOf } from "../roles"
import { FULL_HEIGHT, tracePoints } from "../waveform"
import { MONO_FONT, SANS_FONT, useDrawnTexture, useLabelText } from "./labels"
import { slotRect } from "./layout"
import { CLICK_SLOP_PX } from "./look"
import { HOVER, Ink, INK, Paint, Toon } from "./materials"

type OperatorModule = Extract<ViewOf<"operator">["modules"][number], { kind: "dial" }>
type ScannerModule = Extract<ViewOf<"scanner">["modules"][number], { kind: "dial" }>

/** The Operator's dial setting, shared by the 3D knob and the keyboard control in the HUD. */
export type DialControl = {
  readonly frequency: number
  readonly focused: boolean
  readonly turn: (frequency: number) => void
  readonly focus: () => void
}

const clampFrequency = (frequency: number) =>
  MathUtils.clamp(Math.round(frequency), DIAL_RANGE.min, DIAL_RANGE.max)

const KNOB = { x: -0.15, y: -0.005, radius: 0.08 }
const SWEEP = 0.75 * Math.PI
const TICKS = 10
const DISPLAY = { x: 0.135, y: 0.05, width: 0.24, height: 0.09 }
const SEND = { x: 0.135, y: -0.07, width: 0.2, height: 0.066 }
const PX_PER_STEP = 5
const WHEEL_PER_STEP = 40

/** The knob turns clockwise from the lowest frequency to the highest. */
const knobAngle = (frequency: number) =>
  MathUtils.mapLinear(frequency, DIAL_RANGE.min, DIAL_RANGE.max, SWEEP, -SWEEP)

export function OperatorDial({
  index,
  module,
  dial,
  locked,
  onSend,
}: {
  readonly index: number
  readonly module: OperatorModule
  readonly dial: DialControl
  readonly locked: boolean
  readonly onSend: () => void
}) {
  const rect = slotRect(index)
  const active = !locked && !module.solved
  return (
    <group position={[rect.x, rect.y, 0]}>
      <Knob dial={dial} active={active} />
      <FrequencyDisplay frequency={dial.frequency} solved={module.solved} />
      <SendButton active={active} onSend={onSend} />
    </group>
  )
}

function Knob({ dial, active }: { readonly dial: DialControl; readonly active: boolean }) {
  const [hovered, setHovered] = useState(false)
  const wheel = useRef(0)
  const stopDrag = useRef<(() => void) | null>(null)
  useEffect(() => () => stopDrag.current?.(), [])
  useCursor(hovered && active, "grab")

  const grab = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (!active) return
    const { pointerId, clientX, clientY } = event.nativeEvent
    const from = dial.frequency
    const move = (moved: PointerEvent) => {
      if (moved.pointerId !== pointerId) return
      // Window capture runs before the seat camera's listener, so this drag turns the knob, not the view.
      moved.stopImmediatePropagation()
      dial.turn(clampFrequency(from + (moved.clientX - clientX - (moved.clientY - clientY)) / PX_PER_STEP))
    }
    const release = (released: PointerEvent) => {
      if (released.pointerId !== pointerId) return
      stop()
      dial.focus()
    }
    const stop = () => {
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerup", release, true)
      window.removeEventListener("pointercancel", release, true)
      stopDrag.current = null
    }
    stopDrag.current?.()
    stopDrag.current = stop
    window.addEventListener("pointermove", move, true)
    window.addEventListener("pointerup", release, true)
    window.addEventListener("pointercancel", release, true)
  }

  const spin = (event: ThreeEvent<WheelEvent>) => {
    event.stopPropagation()
    if (!active) return
    wheel.current -= event.nativeEvent.deltaY
    const steps = Math.trunc(wheel.current / WHEEL_PER_STEP)
    if (steps === 0) return
    wheel.current -= steps * WHEEL_PER_STEP
    dial.turn(clampFrequency(dial.frequency + steps))
  }

  const glow = active && hovered
  return (
    <group position={[KNOB.x, KNOB.y, 0]}>
      {Array.from({ length: TICKS }, (_, i) => {
        const angle = MathUtils.lerp(SWEEP, -SWEEP, i / (TICKS - 1)) + Math.PI / 2
        const r = KNOB.radius + 0.022
        return (
          <mesh key={i} position={[Math.cos(angle) * r, Math.sin(angle) * r, 0.006]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.016, 0.004, 0.002]} />
            <Paint color="#aab2c0" />
          </mesh>
        )
      })}
      {dial.focused && active && (
        <mesh position={[0, 0, 0.006]}>
          <ringGeometry args={[KNOB.radius + 0.018, KNOB.radius + 0.026, 48]} />
          <meshBasicMaterial color={HOVER} toneMapped={false} />
        </mesh>
      )}
      <group rotation={[0, 0, knobAngle(dial.frequency)]}>
        <mesh
          position={[0, 0, 0.025]}
          rotation={[Math.PI / 2, 0, 0]}
          onPointerOver={(event) => {
            event.stopPropagation()
            setHovered(true)
          }}
          onPointerOut={() => setHovered(false)}
          onPointerDown={grab}
          onWheel={spin}
        >
          <cylinderGeometry args={[KNOB.radius, KNOB.radius * 1.06, 0.045, 40]} />
          <Toon color="#2b2f3a" emissive={glow ? HOVER : "#000000"} emissiveIntensity={0.25} />
          {glow ? <Ink thickness={0.009} color={HOVER} /> : <Ink thickness={0.004} />}
        </mesh>
        <mesh position={[0, KNOB.radius * 0.55, 0.049]}>
          <boxGeometry args={[0.012, KNOB.radius * 0.7, 0.004]} />
          <meshBasicMaterial color="#f26b3a" toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function FrequencyDisplay({ frequency, solved }: { readonly frequency: number; readonly solved: boolean }) {
  const color = solved ? "#46e08a" : "#ffb347"
  const texture = useDrawnTexture({
    width: 384,
    height: 144,
    key: `${frequency}|${color}`,
    draw: (context, { width, height }) => {
      context.fillStyle = "#120d06"
      context.fillRect(0, 0, width, height)
      context.font = `700 112px ${MONO_FONT}`
      context.direction = "ltr"
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.fillStyle = "#2a1d0c"
      context.fillText("88", width / 2, height / 2 + 6)
      context.shadowColor = color
      context.shadowBlur = 20
      context.fillStyle = color
      context.fillText(String(frequency), width / 2, height / 2 + 6)
    },
  })
  return (
    <group position={[DISPLAY.x, DISPLAY.y, 0]}>
      <RoundedBox args={[DISPLAY.width + 0.03, DISPLAY.height + 0.03, 0.024]} radius={0.01} position={[0, 0, 0.012]}>
        <Paint color={INK} />
      </RoundedBox>
      <mesh position={[0, 0, 0.0245]}>
        <planeGeometry args={[DISPLAY.width, DISPLAY.height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

function SendButton({ active, onSend }: { readonly active: boolean; readonly onSend: () => void }) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered && active)
  const { t, direction, key } = useLabelText()
  const label = useDrawnTexture({
    width: 256,
    height: 84,
    key,
    draw: (context, { width, height }) => {
      context.direction = direction
      context.font = `800 ${direction === "rtl" ? 46 : 40}px ${SANS_FONT}`
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.fillStyle = "#fff8ec"
      context.fillText(t("scene.send"), width / 2, height / 2 + 3)
    },
  })
  const glow = hovered && active
  return (
    <group position={[SEND.x, SEND.y, 0]}>
      <RoundedBox
        args={[SEND.width, SEND.height, 0.03]}
        radius={0.012}
        position={[0, 0, 0.018]}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation()
          if (event.delta > CLICK_SLOP_PX || !active) return
          onSend()
        }}
      >
        <Toon color={active ? "#e0552a" : "#7a4a3a"} emissive={glow ? HOVER : "#000000"} emissiveIntensity={0.3} />
        {glow ? <Ink thickness={0.009} color={HOVER} /> : <Ink thickness={0.004} />}
      </RoundedBox>
      <mesh position={[0, 0, 0.0335]}>
        <planeGeometry args={[SEND.width * 0.9, SEND.width * 0.9 * (84 / 256)]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

const SCREEN = { width: 0.54, height: 0.25 }
const SCREEN_PX = { width: 648, height: 300 }

/** The Scanner sees the dial's waveform glowing on its screen. */
export function ScannerDial({ index, module }: { readonly index: number; readonly module: ScannerModule }) {
  const rect = slotRect(index)
  const { shape, peaks, height } = module.waveform
  const texture = useDrawnTexture({
    ...SCREEN_PX,
    key: `${shape}|${peaks}|${height}|${module.solved}`,
    draw: (context, size) => drawScreen(context, { size, waveform: module.waveform, solved: module.solved }),
  })
  return (
    <group position={[rect.x, rect.y, 0.03]}>
      <mesh renderOrder={2}>
        <planeGeometry args={[SCREEN.width, SCREEN.height]} />
        <meshBasicMaterial map={texture} transparent depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

const MARGIN = 26

function drawScreen(
  context: CanvasRenderingContext2D,
  {
    size: { width, height },
    waveform,
    solved,
  }: { size: { width: number; height: number }; waveform: Waveform; solved: boolean },
) {
  const inner = { width: width - 2 * MARGIN, height: height - 2 * MARGIN }
  const y = (level: number) => MARGIN + (1 - level) * (inner.height / 2)
  context.fillStyle = "rgba(4, 28, 22, 0.9)"
  context.strokeStyle = "#3fe0b0"
  context.lineWidth = 5
  context.beginPath()
  context.roundRect(3, 3, width - 6, height - 6, 22)
  context.fill()
  context.stroke()

  const line = (level: number, dashed: boolean) => {
    context.setLineDash(dashed ? [14, 12] : [])
    context.beginPath()
    context.moveTo(MARGIN, y(level))
    context.lineTo(width - MARGIN, y(level))
    context.stroke()
  }
  context.strokeStyle = "rgba(127, 184, 166, 0.75)"
  context.lineWidth = 3
  line(FULL_HEIGHT, false)
  line(FULL_HEIGHT / 2, true)
  context.strokeStyle = "rgba(127, 184, 166, 0.35)"
  line(0, false)
  context.setLineDash([])

  context.globalAlpha = solved ? 0.35 : 1
  context.strokeStyle = "#d9fff2"
  context.shadowColor = "#3fe0b0"
  context.shadowBlur = 18
  context.lineWidth = 6
  context.lineJoin = "round"
  context.beginPath()
  for (const [i, [x, level]] of tracePoints(waveform).entries()) {
    const point = [MARGIN + x * inner.width, y(level)] as const
    if (i === 0) context.moveTo(...point)
    else context.lineTo(...point)
  }
  context.stroke()
}
