import { useFrame } from "@react-three/fiber"
import { type ReactNode, useLayoutEffect, useMemo, useRef } from "react"
import { Color, type InstancedMesh, MathUtils, Object3D, type PointLight, Vector3 } from "three"
import type { Vec3 } from "./look"
import { CASE, TABLE_TOP_Y } from "./layout"
import { useDrawnTexture } from "./labels"
import { TOON_STEPS } from "./materials"
import { usePrefersReducedMotion } from "./motion"

type Outcome = "won" | "lost"

/**
 * The end of a match: the bomb bursts on a loss, confetti falls on a win.
 * `origin` is the bomb's position, or null for a seat with no bomb in view.
 */
export function Finale({ outcome, origin }: { readonly outcome: Outcome; readonly origin: Vec3 | null }) {
  const flash = usePrefersReducedMotion() ? 0 : 1
  switch (outcome) {
    case "lost":
      if (origin) return <Explosion origin={origin} flashPeak={40 * flash} />
      return <FlashLight position={BOOTH_LIGHT} color="#ff5a3c" peak={12 * flash} />
    case "won":
      return (
        <>
          <Confetti center={origin ?? BOOTH_CONFETTI} />
          <FlashLight position={origin ? [origin[0], origin[1] + 0.6, origin[2] + 0.8] : BOOTH_LIGHT} color="#5cf0a0" peak={6 * flash} />
        </>
      )
    default: {
      const _exhaustive: never = outcome
      return _exhaustive
    }
  }
}

const BOOTH_LIGHT: Vec3 = [0, 1.6, 0.4]
const BOOTH_CONFETTI: Vec3 = [0, 0.8, -0.8]

const FIRE = ["#fff1a8", "#ffd34d", "#ff9a1f", "#ff5a3c"] as const
const SMOKE = ["#3a3f4c", "#4b5160", "#2b2f3a"] as const
const CONFETTI = ["#f5a524", "#4cc3e6", "#8bd450", "#ff4d4f", "#f5e9d4"] as const

type Particle = {
  readonly start: Vector3
  readonly velocity: Vector3
  readonly gravity: number
  readonly spin: number
  readonly size: number
  readonly life: number
  readonly color: string
  /** Swells then shrinks, like smoke, instead of only shrinking. */
  readonly swell: boolean
}

const pick = <T,>(items: readonly [T, ...T[]]) => items[Math.floor(Math.random() * items.length)] ?? items[0]

function Explosion({ origin, flashPeak }: { readonly origin: Vec3; readonly flashPeak: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i): Particle => {
        const smoke = i % 3 === 0
        const direction = new Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize()
        return {
          start: new Vector3(...origin),
          velocity: direction.multiplyScalar(smoke ? MathUtils.randFloat(0.4, 1.1) : MathUtils.randFloat(1.6, 4.2)),
          gravity: smoke ? 0.5 : -4,
          spin: MathUtils.randFloatSpread(8),
          size: smoke ? MathUtils.randFloat(0.18, 0.34) : MathUtils.randFloat(0.05, 0.14),
          life: smoke ? MathUtils.randFloat(2.2, 3.2) : MathUtils.randFloat(0.8, 1.5),
          color: smoke ? pick(SMOKE) : pick(FIRE),
          swell: smoke,
        }
      }),
    [origin],
  )
  return (
    <>
      <Particles particles={particles}>
        <icosahedronGeometry args={[1, 0]} />
      </Particles>
      <FlashLight position={[origin[0], origin[1] + 0.3, origin[2] + 0.6]} color="#ff9a3c" peak={flashPeak} />
      <Scorch origin={origin} />
    </>
  )
}

/** Falls in front of the bomb, between it and the seats, so every seat sees it come down. */
function Scorch({ origin }: { readonly origin: Vec3 }) {
  const texture = useDrawnTexture({
    width: 256,
    height: 256,
    key: "scorch",
    draw: (context, { width, height }) => {
      const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2)
      gradient.addColorStop(0, "rgba(18, 12, 9, 0.9)")
      gradient.addColorStop(0.55, "rgba(30, 20, 14, 0.6)")
      gradient.addColorStop(1, "rgba(30, 20, 14, 0)")
      context.fillStyle = gradient
      context.fillRect(0, 0, width, height)
    },
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[origin[0], TABLE_TOP_Y + 0.003, origin[2]]}>
      <planeGeometry args={[CASE.width * 1.1, CASE.width * 0.8]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

function Confetti({ center }: { readonly center: Vec3 }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 140 }, (): Particle => ({
        start: new Vector3(
          center[0] + MathUtils.randFloatSpread(2.4),
          center[1] + MathUtils.randFloat(0.5, 1.3),
          center[2] + MathUtils.randFloat(0.2, 1.3),
        ),
        velocity: new Vector3(MathUtils.randFloatSpread(0.4), MathUtils.randFloat(0, 0.5), MathUtils.randFloatSpread(0.3)),
        gravity: -0.8,
        spin: MathUtils.randFloatSpread(10),
        size: MathUtils.randFloat(0.022, 0.04),
        life: MathUtils.randFloat(2.4, 3.4),
        color: pick(CONFETTI),
        swell: false,
      })),
    [center],
  )
  return (
    <Particles particles={particles}>
      <boxGeometry args={[1, 0.2, 1.6]} />
    </Particles>
  )
}

const dummy = new Object3D()

/** Moves each particle along its own arc and shrinks it away by the end of its life. */
function Particles({ particles, children }: { readonly particles: readonly Particle[]; readonly children: ReactNode }) {
  const mesh = useRef<InstancedMesh>(null)
  const startedAt = useRef<number | null>(null)
  useLayoutEffect(() => {
    particles.forEach((particle, i) => mesh.current?.setColorAt(i, new Color(particle.color)))
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true
  }, [particles])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    startedAt.current ??= clock.elapsedTime
    const t = clock.elapsedTime - startedAt.current
    particles.forEach((particle, i) => {
      const age = Math.min(1, t / particle.life)
      dummy.position.copy(particle.start).addScaledVector(particle.velocity, t)
      dummy.position.y += 0.5 * particle.gravity * t * t
      dummy.rotation.set(particle.spin * t, particle.spin * t * 0.7, 0)
      dummy.scale.setScalar(particle.size * (particle.swell ? Math.sin(Math.PI * age) * 1.4 : 1 - age))
      dummy.updateMatrix()
      mesh.current?.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, particles.length]} frustumCulled={false}>
      {children}
      <meshToonMaterial gradientMap={TOON_STEPS} />
    </instancedMesh>
  )
}

/** A light that flares to `peak` and fades over about a second. */
function FlashLight({ position, color, peak }: { readonly position: Vec3; readonly color: string; readonly peak: number }) {
  const light = useRef<PointLight>(null)
  const startedAt = useRef<number | null>(null)
  useFrame(({ clock }) => {
    if (!light.current) return
    startedAt.current ??= clock.elapsedTime
    light.current.intensity = peak * Math.exp(-(clock.elapsedTime - startedAt.current) * 2.5)
  })
  return <pointLight ref={light} position={position} color={color} intensity={peak} distance={8} decay={1.2} />
}
