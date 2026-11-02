import { useTranslation } from "react-i18next"
import type { Role } from "./protocol"
import { useVoice } from "./VoiceProvider"

type VoiceState = "speaking" | "idle" | "connecting" | "muted" | "listening"

function useVoiceState(role: Role): VoiceState | null {
  const { me, mic, muted, speaking, links } = useVoice()
  // A player without a seat isn't in the call, so there is nothing to show.
  if (me === null) return null
  const status = role === me ? null : links.get(role)
  if (status && status.connection !== "connected") return "connecting"
  const micState = status ? status.mic : mic.kind !== "on" ? "off" : muted ? "muted" : "live"
  if (micState === "off") return "listening"
  if (micState === "muted") return "muted"
  return speaking.has(role) ? "speaking" : "idle"
}

/** A mic that lights up while its player talks; for the player's own seat it also shows mute and listen-only. */
export function SpeakingIndicator({ role }: { readonly role: Role }) {
  const { t } = useTranslation()
  const state = useVoiceState(role)
  if (!state) return null
  const label = t(`voice.state.${state}`)
  return (
    <span className={`voice-badge ${state}`} role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M6 11a6 6 0 0 0 12 0M12 17v4" fill="none" />
        {(state === "muted" || state === "listening") && <path className="slash" d="M4 4l16 16" fill="none" />}
      </svg>
    </span>
  )
}

/** Mic permission, mute and the input picker, in the lobby's voice panel or the match's crew bar. */
export function MicControls({ compact = false }: { readonly compact?: boolean }) {
  const { t } = useTranslation()
  const { mic, muted, toggleMute, enable, devices, deviceId, selectDevice } = useVoice()
  switch (mic.kind) {
    case "off":
      return (
        <div className="mic-controls">
          {!compact && <p className="muted">{t("voice.prompt")}</p>}
          <button type="button" className="button primary" onClick={enable}>
            {t("voice.enable")}
          </button>
        </div>
      )
    case "asking":
      return <p className="mic-controls muted" role="status">{t("voice.asking")}</p>
    case "denied":
    case "unavailable":
      return (
        <div className="mic-controls">
          <p className="muted" role="status">
            {t(compact ? "voice.state.listening" : `voice.${mic.kind}`)}
          </p>
          <button type="button" className="button" onClick={enable}>
            {t("voice.retry")}
          </button>
        </div>
      )
    case "on":
      return (
        <div className="mic-controls">
          <button
            type="button"
            className={`button mute${muted ? " on" : ""}`}
            aria-pressed={muted}
            aria-keyshortcuts="M"
            onClick={toggleMute}
          >
            {t(muted ? "voice.unmute" : "voice.mute")} <kbd>M</kbd>
          </button>
          {!compact && devices.length > 1 && (
            <label className="field device">
              <span>{t("voice.device")}</span>
              <select value={deviceId} onChange={(event) => selectDevice(event.target.value)}>
                <option value="">{t("voice.defaultDevice")}</option>
                {devices.map((device, i) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || t("voice.deviceN", { n: i + 1 })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )
    default: {
      const _exhaustive: never = mic
      return _exhaustive
    }
  }
}
