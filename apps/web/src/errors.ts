import { isAppError } from "@tick-tock-crew/backend/errors"
import { ConvexError } from "convex/values"
import type { TFunction } from "i18next"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

function errorMessage(t: TFunction, error: unknown) {
  return error instanceof ConvexError && isAppError(error.data)
    ? t(`errors.${error.data.code}`, error.data)
    : t("common.genericError")
}

/** How long a transient error stays up. */
const TRANSIENT_MS = 4000

/**
 * Keeps the failure itself, so its message follows a language switch. A `transient` error goes away after a few
 * seconds, for mid-match errors such as the ping limit that stop applying a moment later.
 */
export function useMutationError({ transient = false }: { readonly transient?: boolean } = {}) {
  const { t } = useTranslation()
  const [failure, setFailure] = useState<{ readonly cause: unknown } | null>(null)
  useEffect(() => {
    if (!failure || !transient) return
    const id = setTimeout(() => setFailure(null), TRANSIENT_MS)
    return () => clearTimeout(id)
  }, [failure, transient])
  const run = <T,>(mutation: Promise<T>) => {
    setFailure(null)
    return mutation.catch((cause: unknown) => {
      setFailure({ cause })
      return null
    })
  }
  return { error: failure && errorMessage(t, failure.cause), run }
}
