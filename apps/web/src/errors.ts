import { ConvexError } from "convex/values"
import { useState } from "react"

function errorMessage(error: unknown) {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : "Something went wrong. Try again."
}

/** Runs a mutation and keeps its user-facing error message until the next run. */
export function useMutationError() {
  const [error, setError] = useState<string | null>(null)
  const run = <T,>(mutation: Promise<T>) => {
    setError(null)
    return mutation.catch((cause: unknown) => {
      setError(errorMessage(cause))
      return null
    })
  }
  return { error, run }
}
