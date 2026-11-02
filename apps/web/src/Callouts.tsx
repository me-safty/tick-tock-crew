import { useTranslation } from "react-i18next"
import type { ManualSection, Ping } from "./pings"
import type { Seat } from "./roles"

/**
 * Emotes from anyone and pings from the rest of the crew, as toasts in the sender's color. A ping only names its
 * target, so the Analyst learns which wire or key, never what it looks like.
 */
export function Callouts({
  pings,
  me,
  seats,
  modules,
}: {
  readonly pings: ReadonlyArray<Ping>
  readonly me: Seat["role"] | null
  readonly seats: ReadonlyArray<Seat>
  /** The kind of each module slot, to name a pinged module. */
  readonly modules: ReadonlyArray<ManualSection>
}) {
  const { t } = useTranslation()
  const moduleName = (index: number) => {
    const kind = modules[index]
    return kind ? t(`manual.${kind}.title`) : ""
  }
  const message = ({ ping }: Ping) => {
    switch (ping.kind) {
      case "emote":
        return t(`emotes.${ping.emote}`)
      case "manual":
        return t("ping.manual", { module: t(`manual.${ping.section}.title`) })
      case "module":
        return t("ping.module", { module: moduleName(ping.module) })
      case "wire":
        return t("ping.wire", { n: ping.wire + 1, module: moduleName(ping.module) })
      case "key":
        return t("ping.key", { n: ping.key + 1, module: moduleName(ping.module) })
      default: {
        const _exhaustive: never = ping
        return _exhaustive
      }
    }
  }
  const shown = pings.filter((ping) => ping.ping.kind === "emote" || ping.fromRole !== me)
  return (
    <ol className="callouts" aria-live="polite">
      {shown.map((ping) => (
        <li key={ping.id} className={`callout ${ping.fromRole} ${ping.ping.kind === "emote" ? "emote" : "ping"}`}>
          <bdi className="callout-name">
            {seats.find((seat) => seat.role === ping.fromRole)?.player?.name ?? t(`roles.${ping.fromRole}.title`)}
          </bdi>
          <span>{message(ping)}</span>
        </li>
      ))}
    </ol>
  )
}
