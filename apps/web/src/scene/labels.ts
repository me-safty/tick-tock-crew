import { useEffect, useMemo, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { CanvasTexture, SRGBColorSpace } from "three"
import { useLanguage } from "../i18n"

type Draw = (context: CanvasRenderingContext2D, size: { width: number; height: number }) => void

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

// The Arabic face only covers Arabic code points (see styles.css), so Latin text keeps the fonts after it.
const ARABIC_FONT = '"IBM Plex Sans Arabic"'
export const MONO_FONT = `${ARABIC_FONT}, "SF Mono", ui-monospace, Menlo, Consolas, monospace`
export const SANS_FONT = `${ARABIC_FONT}, "Avenir Next", "Segoe UI", system-ui, sans-serif`

const ARABIC_FACES = [600, 700].map((weight) => `${weight} 16px ${ARABIC_FONT}`)
const ARABIC_SAMPLE = "ع"

function subscribeToFonts(onChange: () => void) {
  document.fonts.addEventListener("loadingdone", onChange)
  return () => document.fonts.removeEventListener("loadingdone", onChange)
}

const arabicFontsLoaded = () => ARABIC_FACES.every((face) => document.fonts.check(face, ARABIC_SAMPLE))

/**
 * Label text in the player's language. A canvas draws with whichever font has loaded, so `key` also
 * changes once the Arabic font arrives, to redraw labels drawn before it.
 */
export function useLabelText() {
  const { t, i18n } = useTranslation()
  const language = useLanguage()
  const arabicReady = useSyncExternalStore(subscribeToFonts, arabicFontsLoaded)
  useEffect(() => {
    if (language !== "ar") return
    for (const face of ARABIC_FACES) {
      // A face that fails to load leaves the fallback font in place, which is all a label can do.
      void document.fonts.load(face, ARABIC_SAMPLE).catch(() => undefined)
    }
  }, [language])
  return { t, direction: i18n.dir(language), key: `${language}|${arabicReady}` }
}
