import { useSyncExternalStore } from "react"

export type Route = { readonly kind: "home" } | { readonly kind: "room"; readonly code: string }

const ROOM_PATH = /^\/room\/([a-z]{4})\/?$/i

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange)
  return () => window.removeEventListener("popstate", onChange)
}

export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, () => window.location.pathname)
  const code = ROOM_PATH.exec(path)?.[1]
  return code ? { kind: "room", code: code.toUpperCase() } : { kind: "home" }
}

export function roomPath(code: string) {
  return `/room/${code}`
}

export function navigate(path: string) {
  window.history.pushState(null, "", path)
  window.dispatchEvent(new PopStateEvent("popstate"))
}
