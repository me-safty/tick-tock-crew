import type { Glyph, Waveform } from "@tick-tock-crew/rules"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { GLYPH_BOX, GLYPH_STROKE, glyphPath } from "./glyphs"
import { intlLocale, useLanguage } from "./i18n"
import type { ViewOf } from "./roles"
import { FULL_HEIGHT, tracePath } from "./waveform"

type Manual = ViewOf<"analyst">["manual"]
type ManualCell = Extract<Manual[number]["blocks"][number], { kind: "table" }>["rows"][number][number]

export function ManualSheet({ manual, onClose }: { readonly manual: Manual; readonly onClose: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [onClose])
  return (
    <aside className="manual-sheet" aria-label={t("match.manual.title")}>
      <header className="manual-sheet-header">
        <div>
          <span className="eyebrow" lang="en">
            Tick Tock Crew
          </span>
          <h2>{t("match.manual.title")}</h2>
        </div>
        <button type="button" className="button" onClick={onClose}>
          {t("match.manual.close")}
        </button>
      </header>
      {manual.map((section) => (
        <section key={section.title} className="module manual">
          <h3 className="module-title">{t(`manual.${section.title}`)}</h3>
          {section.blocks.map((block, i) =>
            block.kind === "text" ? (
              <p key={i}>{t(`manual.${block.text}`)}</p>
            ) : (
              <table key={i}>
                <thead>
                  <tr>
                    {block.columns.map((column) => (
                      <th key={column}>{t(`manual.${column}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, j) => (
                        <td key={j}>
                          <Cell cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ),
          )}
        </section>
      ))}
    </aside>
  )
}

function Cell({ cell }: { readonly cell: ManualCell }) {
  const { t } = useTranslation()
  const language = useLanguage()
  switch (cell.kind) {
    case "digits":
      return new Intl.ListFormat(intlLocale(language), { type: "disjunction" }).format(cell.digits.map(String))
    case "color":
      return t(`colors.${cell.color}`)
    case "number":
      return String(cell.value)
    case "glyphs":
      return (
        <ol className="ring">
          {cell.glyphs.map((glyph, i) => (
            <li key={i}>
              <GlyphIcon glyph={glyph} />
              <span className="ring-position">{i + 1}</span>
            </li>
          ))}
        </ol>
      )
    case "band":
      return <bdi dir="ltr">{`${cell.low}–${cell.high}`}</bdi>
    case "wave":
      return (
        <span className="wave-cell">
          <WaveIcon waveform={{ shape: cell.shape, peaks: 2, height: "full" }} />
          {t(`waves.${cell.shape}`)}
        </span>
      )
    default: {
      const _exhaustive: never = cell
      return _exhaustive
    }
  }
}

function GlyphIcon({ glyph }: { readonly glyph: Glyph }) {
  return (
    <svg className="glyph" viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`} aria-hidden>
      <path d={glyphPath(glyph)} strokeWidth={GLYPH_STROKE} />
    </svg>
  )
}

const WAVE_BOX = { width: 72, height: 36 }

/** The shape as the Scanner's screen draws it, over the top, middle and center lines. */
function WaveIcon({ waveform }: { readonly waveform: Waveform }) {
  const { width, height } = WAVE_BOX
  const line = (level: number) => `M 0 ${(1 - level) * (height / 2)} H ${width}`
  return (
    <svg className="wave" viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path className="wave-grid" d={`${line(FULL_HEIGHT)} ${line(0)}`} />
      <path className="wave-grid dashed" d={line(FULL_HEIGHT / 2)} />
      <path className="wave-trace" d={tracePath(waveform, WAVE_BOX)} />
    </svg>
  )
}
