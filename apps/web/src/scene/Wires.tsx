import { Billboard, RoundedBox, useCursor } from "@react-three/drei"
import { type ThreeEvent, useFrame } from "@react-three/fiber"
import type { COLORS } from "@tick-tock-crew/rules"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { CatmullRomCurve3, type Group, MathUtils, TubeGeometry, Vector3 } from "three"
import type { ViewOf, WireRef } from "../roles"
import { MONO_FONT, useDrawnTexture } from "./labels"
import { MODULE_SLOTS, type Rect } from "./layout"
import { Ink, Paint, Toon, XRAY } from "./materials"

type OperatorModule = ViewOf<"operator">["modules"][number]
type ScannerModule = ViewOf<"scanner">["modules"][number]

const WIRE_COLORS = {
  red: "#e5484d",
  blue: "#3e7bfa",
  yellow: "#f5d90a",
  white: "#f0f0f0",
  black: "#26282e",
  green: "#30a46c",
} as const satisfies Record<(typeof COLORS)[number], string>

const HOVER = "#ffc24a"
const WIRE_RADIUS = 0.011
const TERMINAL_INSET = 0.075
const MARGIN = 0.035
/** A press that moves farther than this is a look-around drag, not a click. */
const CLICK_SLOP_PX = 6

function wireLayout({ rect, count }: { rect: Rect; count: number }) {
  const span = rect.width - 2 * TERMINAL_INSET
  const usable = rect.height - 2 * MARGIN
  const spacing = usable / count
  return {
    span,
    spacing,
    ys: Array.from({ length: count }, (_, i) => usable / 2 - spacing * (i + 0.5)),
  }
}

function slotOf(index: number) {
  const rect = MODULE_SLOTS[index]
  if (!rect) throw new Error(`The bomb has no slot ${index}`)
  return rect
}

export function OperatorWires({
  index,
  module,
  pending,
  locked,
  onCut,
}: {
  readonly index: number
  readonly module: OperatorModule
  readonly pending: number | null
  readonly locked: boolean
  readonly onCut: (ref: WireRef) => void
}) {
  const rect = slotOf(index)
  const { span, spacing, ys } = wireLayout({ rect, count: module.wires.length })
  const [hovered, setHovered] = useState<number | null>(null)
  const canCut = (wire: number) => !locked && !module.solved && !module.wires[wire]?.cut
  useCursor(hovered !== null && canCut(hovered))
  return (
    <group position={[rect.x, rect.y, 0]}>
      <Terminals rect={rect} span={span} />
      {module.wires.map((wire, i) => {
        const y = ys[i] ?? 0
        const cut = wire.cut || pending === i
        const highlighted = hovered === i && canCut(i)
        const press = (event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          if (event.delta > CLICK_SLOP_PX || !canCut(i)) return
          setHovered(null)
          onCut({ module: index, wire: i })
        }
        return (
          <group key={i}>
            <WireNumber number={i + 1} x={-rect.width / 2 + 0.035} y={y} />
            <Strand y={y} span={span} sag={sagOf(i)} cut={cut} highlighted={highlighted} solid>
              <Toon color={WIRE_COLORS[wire.color]} emissive={highlighted ? HOVER : "#000000"} emissiveIntensity={0.35} />
            </Strand>
            {!cut && (
              <mesh
                position={[0, y, 0.05]}
                onPointerOver={(event) => {
                  event.stopPropagation()
                  setHovered(i)
                }}
                onPointerOut={() => setHovered((current) => (current === i ? null : current))}
                onClick={press}
              >
                <boxGeometry args={[span, Math.min(spacing, 0.04), 0.06]} />
                <meshBasicMaterial visible={false} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

/** The Scanner sees each wire's core through its insulation, with the tag printed on it. */
export function ScannerWires({ index, module }: { readonly index: number; readonly module: ScannerModule }) {
  const rect = slotOf(index)
  const { span, ys } = wireLayout({ rect, count: module.wires.length })
  return (
    <group position={[rect.x, rect.y, 0]}>
      <Terminals rect={rect} span={span} />
      {module.wires.map((wire, i) => {
        const y = ys[i] ?? 0
        return (
          <group key={i}>
            <Strand y={y} span={span} sag={sagOf(i)} cut={wire.cut} highlighted={false}>
              <primitive object={XRAY.part} attach="material" />
            </Strand>
            <Strand y={y} span={span} sag={sagOf(i)} cut={wire.cut} highlighted={false} radius={0.0035}>
              <primitive object={XRAY.core} attach="material" />
            </Strand>
            <Billboard position={[staggeredTagX({ span, wire: i }), y, 0.1]}>
              <TagLabel number={i + 1} tag={`${wire.tag.letter}${wire.tag.digit}`} cut={wire.cut} />
            </Billboard>
          </group>
        )
      })}
    </group>
  )
}

/** Neighbouring tags sit on opposite sides so they never overlap. */
const staggeredTagX = ({ span, wire }: { span: number; wire: number }) => (wire % 2 === 0 ? -1 : 1) * span * 0.2

const sagOf = (wire: number) => (wire % 2 === 0 ? 0.008 : -0.006)

function Terminals({ rect, span }: { readonly rect: Rect; readonly span: number }) {
  return [-1, 1].map((side) => (
    <RoundedBox key={side} args={[0.045, rect.height - 0.05, 0.04]} radius={0.01} position={[(side * span) / 2, 0, 0.02]}>
      <Paint color="#14161c" />
    </RoundedBox>
  ))
}

const CUT_SWING = 0.5
const CUT_SHRINK = 0.2

function halfTube({ halfSpan, sag, radius }: { halfSpan: number; sag: number; radius: number }) {
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0, 0.035),
    new Vector3(halfSpan * 0.55, sag, 0.07),
    new Vector3(halfSpan, sag * 0.8, 0.075),
  ])
  return { geometry: new TubeGeometry(curve, 16, radius, 8), tip: curve.getPoint(1) }
}

/**
 * A wire drawn as two halves pivoting on their terminals, so cutting it swings both ends apart.
 * The right half is the left half mirrored.
 */
function Strand({
  y,
  span,
  sag,
  cut,
  highlighted,
  radius = WIRE_RADIUS,
  solid = false,
  children,
}: {
  readonly y: number
  readonly span: number
  readonly sag: number
  readonly cut: boolean
  readonly highlighted: boolean
  readonly radius?: number
  /** Painted insulation with an inked outline and copper showing at a cut, rather than an X-ray ghost. */
  readonly solid?: boolean
  readonly children: ReactNode
}) {
  const halves = useRef<Array<Group | null>>([])
  const progress = useRef(cut ? 1 : 0)
  const { geometry, tip } = useMemo(() => halfTube({ halfSpan: span / 2, sag, radius }), [span, sag, radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((_, delta) => {
    progress.current = MathUtils.damp(progress.current, cut ? 1 : 0, 8, delta)
    halves.current.forEach((half, i) => {
      if (!half) return
      const side = i === 0 ? -1 : 1
      half.rotation.z = side * progress.current * CUT_SWING
      half.scale.x = -side * (1 - progress.current * CUT_SHRINK)
    })
  })
  return (
    <>
      {solid && !cut && (
        <mesh position={[0, y + sag * 0.8, 0.075]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[radius * 1.5, radius * 1.5, 0.036, 12]} />
          <Toon color="#3a3f4c" />
        </mesh>
      )}
      {[-1, 1].map((side, i) => (
    <group
      key={side}
      ref={(group) => {
        halves.current[i] = group
      }}
      position={[(side * span) / 2, y, 0]}
      scale={[-side, 1, 1]}
    >
      <mesh geometry={geometry}>
        {children}
        {solid && (highlighted ? <Ink thickness={0.009} color={HOVER} /> : <Ink thickness={0.003} />)}
      </mesh>
      {cut && solid && (
        <mesh position={tip}>
          <sphereGeometry args={[radius * 0.8, 10, 8]} />
          <Toon color="#d9894a" />
        </mesh>
      )}
    </group>
      ))}
    </>
  )
}

function WireNumber({ number, x, y }: { readonly number: number; readonly x: number; readonly y: number }) {
  const texture = useDrawnTexture({
    width: 64,
    height: 64,
    key: String(number),
    draw: (context, { width, height }) => {
      context.font = `800 46px ${MONO_FONT}`
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.fillStyle = "#e8e6e1"
      context.fillText(String(number), width / 2, height / 2 + 2)
    },
  })
  return (
    <mesh position={[x, y, 0.006]}>
      <planeGeometry args={[0.03, 0.03]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  )
}

const TAG_SIZE = { width: 0.13, height: 0.048 }

function TagLabel({ number, tag, cut }: { readonly number: number; readonly tag: string; readonly cut: boolean }) {
  const texture = useDrawnTexture({
    width: 260,
    height: 96,
    key: `${number}|${tag}|${cut}`,
    draw: (context, { width, height }) => {
      context.globalAlpha = cut ? 0.45 : 1
      context.fillStyle = "rgba(4, 28, 22, 0.88)"
      context.strokeStyle = "#3fe0b0"
      context.lineWidth = 5
      context.beginPath()
      context.roundRect(4, 4, width - 8, height - 8, 22)
      context.fill()
      context.stroke()
      context.textBaseline = "middle"
      context.fillStyle = "#7fb8a6"
      context.font = `700 34px ${MONO_FONT}`
      context.fillText(String(number), 26, height / 2 + 2)
      context.fillStyle = "#d9fff2"
      context.font = `800 58px ${MONO_FONT}`
      context.textAlign = "right"
      context.fillText(tag, width - 28, height / 2 + 3)
      if (cut) {
        context.fillRect(20, height / 2, width - 40, 5)
      }
    },
  })
  return (
    <mesh renderOrder={2}>
      <planeGeometry args={[TAG_SIZE.width, TAG_SIZE.height]} />
      <meshBasicMaterial map={texture} transparent depthTest={false} toneMapped={false} />
    </mesh>
  )
}

