import { EMOTES } from "@tick-tock-crew/rules"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { hasModifier, isTyping } from "./keys"
import type { Emote } from "./pings"

const RADIUS_PERCENT = 36
/** Digit keys by position, so the Arabic layout's own digits pick the same calls. */
const DIGIT = /^(?:Digit|Numpad)([1-9])$/

/** A ring of quick calls. Number keys 1–6 pick one while it is open; Escape or a click elsewhere closes it. */
export function EmoteWheel({ onEmote }: { readonly onEmote: (emote: Emote) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const wheel = useRef<HTMLDivElement>(null)
  const close = () => {
    setOpen(false)
    toggle.current?.focus({ preventScroll: true })
  }
  const send = (emote: Emote) => {
    close()
    onEmote(emote)
  }
  const latest = useRef({ close, send })
  latest.current = { close, send }

  useEffect(() => {
    if (!open) return
    wheel.current?.querySelector("button")?.focus({ preventScroll: true })
    // Capture, so the wheel takes Escape before the manual sheet or ping mode would.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        latest.current.close()
        return
      }
      if (hasModifier(event) || isTyping(event.target)) return
      const emote = EMOTES[Number(DIGIT.exec(event.code)?.[1] ?? 0) - 1]
      if (emote) latest.current.send(emote)
    }
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && (wheel.current?.contains(event.target) || toggle.current?.contains(event.target))) return
      setOpen(false)
    }
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("pointerdown", onPointer)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("pointerdown", onPointer)
    }
  }, [open])

  return (
    <div className="emote">
      <button
        ref={toggle}
        type="button"
        className={`button${open ? " on" : ""}`}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {t("emotes.open")}
      </button>
      {open && (
        <div ref={wheel} className="emote-wheel" role="group" aria-label={t("emotes.open")}>
          {EMOTES.map((emote, i) => {
            const angle = (i / EMOTES.length) * 2 * Math.PI
            return (
              <button
                key={emote}
                type="button"
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
