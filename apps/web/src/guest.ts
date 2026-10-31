import { useState } from "react"

const SESSION_KEY = "ttc.sessionId"
const NICKNAME_KEY = "ttc.nickname"

function loadSessionId() {
  const existing = localStorage.getItem(SESSION_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(SESSION_KEY, created)
  return created
}

export const sessionId = loadSessionId()

export function useNickname() {
  const [nickname, setNickname] = useState(() => localStorage.getItem(NICKNAME_KEY) ?? "")
  const update = (next: string) => {
    setNickname(next)
    localStorage.setItem(NICKNAME_KEY, next)
  }
  return [nickname, update] as const
}
