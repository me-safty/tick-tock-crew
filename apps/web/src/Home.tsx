import { api } from "@tick-tock-crew/backend/api"
import { useMutation } from "convex/react"
import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useMutationError } from "./errors"
import { sessionId, useNickname } from "./guest"
import { LanguageSwitch } from "./i18n/LanguageSwitch"
import { navigate, roomPath } from "./router"

export function Home() {
  const { t } = useTranslation()
  const [nickname, setNickname] = useNickname()
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const { error, run } = useMutationError()
  const createRoom = useMutation(api.rooms.createRoom)
  const joinRoom = useMutation(api.rooms.joinRoom)
  const hasNickname = nickname.trim().length > 0

  const enter = async (mutation: Promise<string>) => {
    setBusy(true)
    const roomCode = await run(mutation)
    setBusy(false)
    if (roomCode) navigate(roomPath(roomCode))
  }

  const create = (event: FormEvent) => {
    event.preventDefault()
    void enter(createRoom({ sessionId }))
  }

  const join = (event: FormEvent) => {
    event.preventDefault()
    void enter(joinRoom({ code }))
  }

  return (
    <main className="screen">
      <section className="panel">
        <header className="brand">
          <div className="brand-top">
            <span className="led">00:00</span>
            <LanguageSwitch />
          </div>
          <h1 lang="en">Tick Tock Crew</h1>
          <p className="muted">{t("home.tagline")}</p>
        </header>

        <form className="create" onSubmit={create}>
          <label className="field">
            <span>{t("home.nickname")}</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={20}
              placeholder={t("home.nicknamePlaceholder")}
              autoFocus
            />
          </label>
          <button type="submit" className="button primary" disabled={!hasNickname || busy}>
            {t("home.createRoom")}
          </button>
        </form>

        <div className="divider">{t("home.orJoin")}</div>

        <form className="join" onSubmit={join}>
          <input
            aria-label={t("home.roomCode")}
            className="code-input"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={4}
            placeholder={t("home.codePlaceholder")}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button type="submit" className="button" disabled={!hasNickname || busy || code.length !== 4}>
            {t("home.join")}
          </button>
        </form>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
