import { isAppError } from "@tick-tock-crew/backend/errors"
import { ConvexError } from "convex/values"
import type { TFunction } from "i18next"
import { useState } from "react"
import { useTranslation } from "react-i18next"

function errorMessage(t: TFunction, error: unknown) {
  return error instanceof ConvexError && isAppError(error.data)
    ? t(`errors.${error.data.code}`, error.data)
    : t("common.genericError")
}

/** Keeps the failure itself, so its message follows a language switch. */
export function useMutationError() {
  const { t } = useTranslation()
  const [failure, setFailure] = useState<{ readonly cause: unknown } | null>(null)
  const run = <T,>(mutation: Promise<T>) => {
    setFailure(null)
    return mutation.catch((cause: unknown) => {
      setFailure({ cause })
      return null
    })
  }
  return { error: failure && errorMessage(t, failure.cause), run }
}
