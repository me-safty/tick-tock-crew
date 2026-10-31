import { RoundedBox } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { MAX_STRIKES } from "@tick-tock-crew/rules"
import { type ReactNode, useEffect, useMemo, useRef } from "react"
import { formatClock, secondsLeft, URGENT_SECONDS } from "../clock"
import type { Match, ViewOf } from "../roles"
import { createCanvasTexture, MONO_FONT, SANS_FONT, useDrawnTexture } from "./labels"
import { BOMB_POSITION, CASE, FACE, FACE_Z, FOOTER, HEADER, MODULE_SLOTS, type Rect } from "./layout"
import { Ink, INK, Paint, useXray, XrayContext } from "./materials"
import { usePrefersReducedMotion } from "./motion"

export type BombView = ViewOf<"operator"> | ViewOf<"scanner">
type MatchClock = Pick<Match, "status" | "endsAt" | "strikes">

const PAINT = {
  shell: "#e9b53f",
  trim: "#2b2f3a",
  panel: "#323846",
  tray: "#1b1e26",
  cover: "#4a5263",
  steel: "#c9d1d9",
} as const

const LED_RED = "#ff4d4f"
const LED_GREEN = "#46e08a"

/** The bomb on the table. The Operator sees its paint; the Scanner sees through it. */
export function Bomb({
  view,
  match,
  children,
}: {
  readonly view: BombView
  readonly match: MatchClock
  /** The modules, each placed in its own slot from MODULE_SLOTS. */
  readonly children: ReactNode
}) {
  return (
    <XrayContext value={view.role === "scanner"}>
      <group position={BOMB_POSITION}>
        <Casing />
        <group position={[0, 0, FACE_Z]}>
          <TimerDisplay status={match.status} endsAt={match.endsAt} />
          <StrikeLamps strikes={match.strikes} />
          <SerialPlate serial={view.role === "operator" ? view.serial : null} />
          {MODULE_SLOTS.map((slot, index) => {
            const module = view.modules[index]
            return (
              <Slot key={index} rect={slot}>
                {module ? <ModuleLamp rect={slot} solved={module.solved} /> : <CoverPlate rect={slot} />}
              </Slot>
            )
          })}
          {children}
        </group>
      </group>
    </XrayContext>
  )
}

const CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const

function Casing() {
  const { width, height, depth } = CASE
  const xray = useXray()
  return (
    <group>
      {xray && (
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[width - 0.08, height - 0.08, depth - 0.1]} />
          <meshBasicMaterial color="#061a16" />
        </mesh>
      )}
      <RoundedBox args={[width, height, depth]} radius={0.07} smoothness={4}>
        <Paint color={PAINT.shell} xray="shell" />
        <Ink thickness={0.016} />
      </RoundedBox>
      {CORNERS.map(([x, y]) => (
        <RoundedBox key={`${x},${y}`} args={[0.16, 0.16, depth + 0.04]} radius={0.04} position={[(x * width) / 2, (y * height) / 2, 0]}>
          <Paint color={PAINT.trim} />
          <Ink />
        </RoundedBox>
      ))}
      {[-0.26, 0.26].map((x) => (
        <mesh key={x} position={[x, height / 2 + 0.05, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.1, 12]} />
          <Paint color={PAINT.trim} />
        </mesh>
      ))}
      <RoundedBox args={[0.64, 0.06, 0.08]} radius={0.025} position={[0, height / 2 + 0.12, 0]}>
        <Paint color={PAINT.trim} />
        <Ink />
      </RoundedBox>
      <RoundedBox args={[FACE.width, FACE.height, 0.024]} radius={0.012} position={[0, 0, depth / 2]}>
        <Paint color={PAINT.panel} />
      </RoundedBox>
    </group>
  )
}

const TIMER = { width: 0.46, height: 0.12 }
const TIMER_X = HEADER.x - HEADER.width / 2 + TIMER.width / 2 + 0.03

type LedFace = { readonly text: string; readonly color: string }

function timerFace({ status, seconds, blinkOff }: { status: Match["status"]; seconds: number; blinkOff: boolean }): LedFace {
  switch (status) {
    case "won":
      return { text: "SAFE", color: LED_GREEN }
    case "lost":
      return { text: "BOOM", color: LED_RED }
    case "playing":
      return { text: formatClock(seconds), color: seconds <= URGENT_SECONDS && blinkOff ? "#6b1a1c" : LED_RED }
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

/** Counts down from `endsAt` on this device, redrawing only when the shown text changes. */
function TimerDisplay({ status, endsAt }: Pick<MatchClock, "status" | "endsAt">) {
  const reducedMotion = usePrefersReducedMotion()
  const canvas = useMemo(() => createCanvasTexture({ width: 512, height: 136 }), [])
  useEffect(() => () => canvas.texture.dispose(), [canvas])
  const shown = useRef("")
  useFrame(() => {
    const now = Date.now()
    const face = timerFace({
      status,
      seconds: secondsLeft(endsAt, now),
      blinkOff: !reducedMotion && Math.floor(now / 500) % 2 === 1,
    })
    const key = `${face.text}|${face.color}`
    if (key === shown.current) return
    shown.current = key
    canvas.draw((context, { width, height }) => {
      context.fillStyle = "#14080a"
      context.fillRect(0, 0, width, height)
      context.font = `700 104px ${MONO_FONT}`
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.fillStyle = "#33100f"
      context.fillText(face.text.replace(/[0-9]/g, "8"), width / 2, height / 2 + 4)
      context.shadowColor = face.color
      context.shadowBlur = 22
      context.fillStyle = face.color
      context.fillText(face.text, width / 2, height / 2 + 4)
    })
  })
  return (
    <group position={[TIMER_X, HEADER.y, 0]}>
      <RoundedBox args={[TIMER.width + 0.04, TIMER.height + 0.04, 0.03]} radius={0.012}>
        <Paint color={INK} />
      </RoundedBox>
      <mesh position={[0, 0, 0.016]}>
        <planeGeometry args={[TIMER.width, TIMER.height]} />
        <meshBasicMaterial map={canvas.texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

const LAMP_SPACING = 0.1
const LAMPS_RIGHT = HEADER.x + HEADER.width / 2 - 0.07

function StrikeLamps({ strikes }: { readonly strikes: number }) {
  const label = useDrawnTexture({
    width: 256,
    height: 48,
    key: "strikes",
    draw: (context, { width, height }) => {
      context.font = `700 30px ${SANS_FONT}`
      context.textAlign = "right"
      context.textBaseline = "middle"
      context.fillStyle = "#aab2c0"
      context.fillText("STRIKES", width, height / 2)
    },
  })
  return (
    <group position={[0, HEADER.y, 0]}>
      <mesh position={[LAMPS_RIGHT - (MAX_STRIKES - 1) * LAMP_SPACING - 0.17, 0, 0.002]}>
        <planeGeometry args={[0.2, 0.0375]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
      {Array.from({ length: MAX_STRIKES }, (_, i) => (
        <group key={i} position={[LAMPS_RIGHT - (MAX_STRIKES - 1 - i) * LAMP_SPACING, 0, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.042, 0.046, 0.02, 20]} />
            <Paint color={INK} />
          </mesh>
          <mesh position={[0, 0, 0.01]} scale={[1, 1, 0.6]}>
            <sphereGeometry args={[0.032, 20, 12]} />
            {i < strikes ? <meshBasicMaterial color={LED_RED} toneMapped={false} /> : <Paint color="#4a1618" />}
          </mesh>
        </group>
      ))}
    </group>
  )
}

const PLATE = { width: 0.5, height: 0.066 }
const PLATE_X = FOOTER.x + FOOTER.width / 2 - PLATE.width / 2 - 0.03

/** The Operator reads the serial off this plate; the Scanner's view has no serial, so its plate stays blank. */
function SerialPlate({ serial }: { readonly serial: string | null }) {
  return (
    <group position={[PLATE_X, FOOTER.y, 0]}>
      <RoundedBox args={[PLATE.width, PLATE.height, 0.012]} radius={0.006}>
        <Paint color={PAINT.steel} />
      </RoundedBox>
      {serial && <SerialText serial={serial} />}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * (PLATE.width - 0.03)) / 2, 0, 0.007]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.006, 10]} />
          <Paint color="#8a939f" />
        </mesh>
      ))}
    </group>
  )
}

function SerialText({ serial }: { readonly serial: string }) {
  const texture = useDrawnTexture({
    width: 640,
    height: 84,
    key: serial,
    draw: (context, { width, height }) => {
      context.textBaseline = "middle"
      context.fillStyle = "#4b5260"
      context.font = `700 26px ${SANS_FONT}`
      context.fillText("SERIAL", 34, height / 2 + 2)
      context.fillStyle = INK
      context.font = `800 54px ${MONO_FONT}`
      context.textAlign = "right"
      context.fillText(serial.split("").join(" "), width - 34, height / 2 + 3)
    },
  })
  return (
    <mesh position={[0, 0, 0.0065]}>
      <planeGeometry args={[PLATE.width - 0.04, (PLATE.width - 0.04) * (84 / 640)]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  )
}

function Slot({ rect, children }: { readonly rect: Rect; readonly children?: ReactNode }) {
  return (
    <group position={[rect.x, rect.y, 0]}>
      <mesh position={[0, 0, 0.002]}>
        <boxGeometry args={[rect.width, rect.height, 0.004]} />
        <Paint color={PAINT.tray} />
      </mesh>
      {CORNERS.map(([x, y]) => (
        <mesh key={`${x},${y}`} position={[(x * rect.width) / 2 - x * 0.02, (y * rect.height) / 2 - y * 0.02, 0.006]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.009, 0.009, 0.006, 10]} />
          <Paint color={PAINT.steel} />
        </mesh>
      ))}
      {children}
    </group>
  )
}

/** Fills a slot that has no module yet, so the case reads as finished. */
function CoverPlate({ rect }: { readonly rect: Rect }) {
  return (
    <group position={[0, 0, 0.008]}>
      <RoundedBox args={[rect.width - 0.07, rect.height - 0.07, 0.01]} radius={0.004}>
        <Paint color={PAINT.cover} />
      </RoundedBox>
      {[-1, 0, 1].map((row) => (
        <mesh key={row} position={[0, row * 0.035, 0.0055]}>
          <boxGeometry args={[rect.width * 0.45, 0.012, 0.002]} />
          <Paint color={PAINT.tray} />
        </mesh>
      ))}
    </group>
  )
}

/** Lights green once the module in this slot is defused. */
function ModuleLamp({ rect, solved }: { readonly rect: Rect; readonly solved: boolean }) {
  return (
    <mesh position={[0, rect.height / 2 - 0.018, 0.008]} scale={[1, 1, 0.5]}>
      <sphereGeometry args={[0.013, 14, 10]} />
      {solved ? <meshBasicMaterial color={LED_GREEN} toneMapped={false} /> : <Paint color="#1d3a2a" />}
    </mesh>
  )
}
