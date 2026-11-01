import { useTranslation } from "react-i18next"
import { setLanguage, useLanguage } from "."

/** Names the other language in that language, so either reader can find it. */
export function LanguageSwitch() {
  const { t } = useTranslation()
  const other = useLanguage() === "ar" ? "en" : "ar"
  return (
    <button type="button" className="button lang-switch" title={t("language.switch")} onClick={() => setLanguage(other)}>
      <span lang={other}>{t("language.name", { lng: other })}</span>
    </button>
  )
}
