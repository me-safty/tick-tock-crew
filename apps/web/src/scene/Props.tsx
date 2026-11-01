import { Center, useGLTF } from "@react-three/drei"
import type { ThreeElements } from "@react-three/fiber"
import { useMemo } from "react"
import { type Material, Mesh, MeshStandardMaterial, MeshToonMaterial, type Object3D } from "three"
import { TOON_STEPS } from "./materials"

const MODELS = [
  "bookcaseOpen",
  "books",
  "cardboardBoxClosed",
  "desk",
  "lampRoundTable",
  "lampSquareFloor",
  "plantSmall1",
  "pottedPlant",
  "radio",
  "rugRectangle",
] as const

type ModelName = (typeof MODELS)[number]

const urlOf = (name: ModelName) => `${import.meta.env.BASE_URL}models/kenney/${name}.glb`

for (const name of MODELS) useGLTF.preload(urlOf(name), false)

/** Kenney's furniture is modeled at about half of real size. */
const KENNEY_SCALE = 2

const toonCache = new WeakMap<Material, MeshToonMaterial>()

function toToon(material: Material) {
  const cached = toonCache.get(material)
  if (cached) return cached
  const toon = new MeshToonMaterial({
    color: material instanceof MeshStandardMaterial ? material.color : 0xffffff,
    gradientMap: TOON_STEPS,
  })
  toonCache.set(material, toon)
  return toon
}

/** A copy of the model repainted with the scene's toon shading, so it matches the code-built props. */
function toonCopy(scene: Object3D) {
  const copy = scene.clone(true)
  copy.traverse((object) => {
    if (object instanceof Mesh) {
      object.material = Array.isArray(object.material) ? object.material.map(toToon) : toToon(object.material)
    }
  })
  return copy
}

/** A Kenney furniture model, centered on its footprint and standing on y = 0 at `position`. */
export function Prop({ name, scale = 1, ...props }: { readonly name: ModelName; readonly scale?: number } & ThreeElements["group"]) {
  const { scene } = useGLTF(urlOf(name), false)
  const object = useMemo(() => toonCopy(scene), [scene])
  return (
    <group {...props}>
      <Center disableY>
        <primitive object={object} scale={KENNEY_SCALE * scale} />
      </Center>
    </group>
  )
}
