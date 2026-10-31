import { useEffect, useMemo } from "react"
import { CanvasTexture, SRGBColorSpace } from "three"

export type Draw = (context: CanvasRenderingContext2D, size: { width: number; height: number }) => void

/** A texture you can redraw, for text that should stay crisp without loading a font file. */
export function createCanvasTexture({ width, height }: { width: number; height: number }) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("2D canvas is not available")
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  const draw = (paint: Draw) => {
    context.clearRect(0, 0, width, height)
    paint(context, { width, height })
    texture.needsUpdate = true
  }
  return { texture, draw }
}

/** A texture drawn once per `key`; pass a key that changes whenever the drawing would. */
export function useDrawnTexture({ width, height, key, draw }: { width: number; height: number; key: string; draw: Draw }) {
  const texture = useMemo(() => {
    const canvas = createCanvasTexture({ width, height })
    canvas.draw(draw)
    return canvas.texture
  }, [width, height, key])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

export const MONO_FONT = '"SF Mono", ui-monospace, Menlo, Consolas, monospace'
export const SANS_FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif'
