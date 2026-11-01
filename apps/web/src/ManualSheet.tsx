import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { intlLocale, useLanguage } from "./i18n"
import type { ViewOf } from "./roles"

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
                          <CellText cell={cell} />
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

function CellText({ cell }: { readonly cell: ManualCell }) {
  const { t } = useTranslation()
  const language = useLanguage()
  switch (cell.kind) {
    case "digits":
      return new Intl.ListFormat(intlLocale(language), { type: "disjunction" }).format(cell.digits.map(String))
    case "color":
      return t(`colors.${cell.color}`)
    default: {
      const _exhaustive: never = cell
      return _exhaustive
    }
  }
}
