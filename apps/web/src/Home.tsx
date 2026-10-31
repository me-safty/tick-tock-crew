import { api } from "@tick-tock-crew/backend/api"
import { useMutation } from "convex/react"
import { useState, type FormEvent } from "react"
import { useMutationError } from "./errors"
import { sessionId, useNickname } from "./guest"
import { navigate, roomPath } from "./router"

export function Home() {
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
          <span className="led">00:00</span>
          <h1>Tick Tock Crew</h1>
          <p className="muted">Three players, one bomb, and nobody sees the whole picture.</p>
        </header>

        <form className="create" onSubmit={create}>
          <label className="field">
            <span>Nickname</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={20}
              placeholder="What should the crew call you?"
              autoFocus
            />
          </label>
          <button type="submit" className="button primary" disabled={!hasNickname || busy}>
            Create room
          </button>
        </form>

        <div className="divider">or join a crew</div>

        <form className="join" onSubmit={join}>
          <input
            aria-label="Room code"
            className="code-input"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={4}
            placeholder="CODE"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button type="submit" className="button" disabled={!hasNickname || busy || code.length !== 4}>
            Join
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
