import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { Seat } from "./roles"
import { MicControls, SpeakingIndicator } from "./voice/VoiceControls"

/** The seated crew with who is talking, and the player's own mic and call controls. */
export function CrewBar({ seats, children }: { readonly seats: ReadonlyArray<Seat>; readonly children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <section className="crew-bar" aria-label={t("voice.crew")}>
      <ul className="crew">
        {seats.map(
          ({ role, player }) =>
            player && (
              <li key={role} className={`crew-member ${role}`}>
                <span className="crew-role">{t(`roles.${role}.title`)}</span>
                <bdi className="crew-name">{player.name}</bdi>
                <SpeakingIndicator role={role} />
              </li>
            ),
        )}
      </ul>
      <div className="crew-actions">
        <MicControls compact />
        {children}
      </div>
    </section>
  )
}
