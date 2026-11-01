import { ERROR_CODES } from "@tick-tock-crew/backend/errors"
import { describe, expect, test } from "vitest"
import { type Language, resources } from "./resources"

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const VARIABLE = /\{\{\s*(\w+)/g

function leaves(tree: unknown, path = ""): Array<{ key: string; text: string }> {
  if (typeof tree === "string") return [{ key: path, text: tree }]
  if (typeof tree !== "object" || tree === null) throw new Error(`${path} is neither text nor a group`)
  return Object.entries(tree).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key))
}

/** Each key without its plural suffix, with the variables used across all of its forms. */
function shape(language: Language) {
  const keys = new Map<string, Set<string>>()
  for (const { key, text } of leaves(resources[language].translation)) {
    const base = key.replace(PLURAL_SUFFIX, "")
    const variables = keys.get(base) ?? new Set()
    for (const [, name] of text.matchAll(VARIABLE)) variables.add(name ?? "")
    keys.set(base, variables)
  }
  return Object.fromEntries([...keys].map(([key, variables]) => [key, [...variables].sort()]))
}

describe("translations", () => {
  test("ar and en have the same keys with the same interpolation variables", () => {
    expect(shape("ar")).toEqual(shape("en"))
  })

  test.each(["ar", "en"] as const)("%s has every plural form its language needs", (language) => {
    const needed = new Intl.PluralRules(language).resolvedOptions().pluralCategories
    const plurals = leaves(resources[language].translation).flatMap(({ key }) => {
      const match = PLURAL_SUFFIX.exec(key)
      return match ? [{ base: key.slice(0, match.index), form: match[1] }] : []
    })
    for (const base of new Set(plurals.map((plural) => plural.base))) {
      const forms = plurals.filter((plural) => plural.base === base).map((plural) => plural.form)
      expect(forms.sort(), base).toEqual([...needed].sort())
    }
  })

  test.each(["ar", "en"] as const)("%s translates exactly the backend's error codes", (language) => {
    expect(Object.keys(resources[language].translation.errors).sort()).toEqual([...ERROR_CODES].sort())
  })
})
