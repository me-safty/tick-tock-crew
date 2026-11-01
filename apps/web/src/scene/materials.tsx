import { Outlines } from "@react-three/drei"
import type { ThreeElements } from "@react-three/fiber"
import { createContext, useContext } from "react"
import { AdditiveBlending, Color, DataTexture, NearestFilter, RedFormat, ShaderMaterial } from "three"

export const INK = "#141720"
/** The glow on whatever the Operator's pointer would act on. */
export const HOVER = "#ffc24a"

export const TOON_STEPS = new DataTexture(new Uint8Array([96, 178, 255]), 3, 1, RedFormat)
TOON_STEPS.minFilter = NearestFilter
TOON_STEPS.magFilter = NearestFilter
TOON_STEPS.needsUpdate = true

/** Flat three-step shading for the stylized look. */
export function Toon(props: ThreeElements["meshToonMaterial"]) {
  return <meshToonMaterial gradientMap={TOON_STEPS} {...props} />
}

/** Whether the Scanner's X-ray lens is drawing this subtree. */
export const XrayContext = createContext(false)

export const useXray = () => useContext(XrayContext)

/** An inked outline in the normal look; the X-ray lens has none. */
export function Ink({ thickness = 0.012, color = INK }: { readonly thickness?: number; readonly color?: string }) {
  return useXray() ? null : <Outlines screenspace thickness={thickness} color={color} />
}

function xrayMaterial({ color, base, rim }: { color: string; base: number; rim: number }) {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(color) }, base: { value: base }, rim: { value: rim } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float base;
      uniform float rim;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        gl_FragColor = vec4(color * (base + fresnel * rim), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

/** Glass-like shells for the X-ray lens: the edges glow, faces facing the lens stay faint. */
export const XRAY = {
  shell: xrayMaterial({ color: "#3fe0b0", base: 0.015, rim: 0.45 }),
  part: xrayMaterial({ color: "#3fe0b0", base: 0.06, rim: 0.6 }),
  core: xrayMaterial({ color: "#c8fff0", base: 0.9, rim: 0.4 }),
} as const

type XrayPart = keyof typeof XRAY

/** Toon paint in the normal look, an X-ray shell under the Scanner's lens. */
export function Paint({ xray = "part", ...props }: ThreeElements["meshToonMaterial"] & { readonly xray?: XrayPart }) {
  return useXray() ? <primitive object={XRAY[xray]} attach="material" /> : <Toon {...props} />
}
