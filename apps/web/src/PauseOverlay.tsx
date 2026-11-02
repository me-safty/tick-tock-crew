import { api } from "@tick-tock-crew/backend/api"
import { useMutation } from "convex/react"
import { useTranslation } from "react-i18next"
import { useMutationError } from "./errors"
import { sessionId, useNickname } from "./guest"
import { intlLocale, useLanguage } from "./i18n"
import type { Lobby } from "./roles"

/** Shown to everyone while the match waits for a player who dropped; a spectator may take the empty seat. */
export function PauseOverlay({ lobby, seated }: { readonly lobby: Lobby; readonly seated: boolean }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [nickname, setNickname] = useNickname()
  const takeOverSeat = useMutation(api.pause.takeOverSeat)
  const { error, run } = useMutationError()
  const absent = lobby.seats.flatMap(({ role, player }) => (player && !player.online ? [{ role, name: player.name }] : []))
  const waitingFor = new Intl.ListFormat(intlLocale(language), { type: "conjunction" }).format(
    // First-strong isolates keep a Latin name from reordering the Arabic around it.
    absent.map(({ role, name }) => t("pause.seat", { role: t(`roles.${role}.title`), name: `\u2068${name}\u2069` })),
  )
  return (
    <div className="pause-screen" role="dialog" aria-modal="false" aria-labelledby="pause-title">
      <section className="panel pause-panel">
        <span className="eyebrow">{t("pause.eyebrow")}</span>
        <h1 id="pause-title">{t("pause.title")}</h1>
        {absent.length > 0 && <p aria-live="polite">{t("pause.waitingFor", { seats: waitingFor })}</p>}
        <p className="muted">{t("pause.timerStopped")}</p>
        {!seated && absent.length > 0 && (
          <div className="pause-takeover">
            <label className="field">
              <span>{t("lobby.yourNickname")}</span>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={20}
                placeholder={t("lobby.nicknamePlaceholder")}
              />
            </label>
            {absent.map(({ role }) => (
              <button
                key={role}
                type="button"
                className="button primary"
                disabled={nickname.trim().length === 0}
                onClick={() => void run(takeOverSeat({ code: lobby.code, sessionId, name: nickname, role }))}
              >
                {t("pause.takeOver", { role: t(`roles.${role}.title`) })}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}
