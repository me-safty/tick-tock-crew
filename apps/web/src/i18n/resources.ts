import ar from "./locales/ar.json"
import en from "./locales/en.json"

export const resources = { ar: { translation: ar }, en: { translation: en } } as const

export type Language = keyof typeof resources
