import { EMOTES } from "@tick-tock-crew/rules"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Emote } from "./pings"

const RADIUS_PERCENT = 36

/** A ring of quick calls. Number keys pick one while it is open; Escape closes it. */
export function EmoteWheel({ onEmote }: { readonly onEmote: (emote: Emote) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const send = (emote: Emote) => {
    setOpen(false)
    onEmote(emote)
  }
  const latestSend = useRef(send)
  latestSend.current = send
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
      const emote = EMOTES[Number(event.key) - 1]
      if (emote) latestSend.current(emote)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
  return (
    <div className="emote">
      <button
        type="button"
        className={`button${open ? " on" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        {t("emotes.open")}
      </button>
      {open && (
        <div className="emote-wheel" role="menu" aria-label={t("emotes.open")}>
          {EMOTES.map((emote, i) => {
            const angle = (i / EMOTES.length) * 2 * Math.PI
            return (
              <button
                key={emote}
                type="button"
                role="menuitem"
                className="emote-option"
                aria-keyshortcuts={String(i + 1)}
                style={{ left: `${50 + RADIUS_PERCENT * Math.sin(angle)}%`, top: `${50 - RADIUS_PERCENT * Math.cos(angle)}%` }}
                onClick={() => send(emote)}
              >
                {t(`emotes.${emote}`)}
                <kbd>{i + 1}</kbd>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
