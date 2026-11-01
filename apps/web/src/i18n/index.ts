import i18next from "i18next"
import { initReactI18next, useTranslation } from "react-i18next"
import { type Language, resources } from "./resources"

export type { Language }
const DEFAULT_LANGUAGE: Language = "ar"
const STORAGE_KEY = "ttc.language"

const isLanguage = (value: unknown): value is Language => value === "ar" || value === "en"

function storedLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isLanguage(stored) ? stored : DEFAULT_LANGUAGE
}

i18next.on("languageChanged", (language) => {
  document.documentElement.lang = language
  document.documentElement.dir = i18next.dir(language)
})

void i18next.use(initReactI18next).init({
  resources,
  lng: storedLanguage(),
  fallbackLng: false,
  initAsync: false,
  interpolation: { escapeValue: false },
})

export function setLanguage(language: Language) {
  localStorage.setItem(STORAGE_KEY, language)
  void i18next.changeLanguage(language)
}

export function useLanguage(): Language {
  const { i18n } = useTranslation()
  return isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE
}

/** A locale for Intl APIs that keeps Western digits in Arabic too. */
export const intlLocale = (language: Language) => `${language}-u-nu-latn`
