import { Component, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

type Props = { readonly children: ReactNode }
type State = { readonly failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override render() {
    return this.state.failed ? <CrashScreen /> : this.props.children
  }
}

function CrashScreen() {
  const { t } = useTranslation()
  return (
    <main className="screen">
      <section className="panel">
        <h1>{t("common.crashTitle")}</h1>
        <p className="muted">{t("common.crashBody")}</p>
        <button type="button" className="button primary" onClick={() => window.location.assign("/")}>
          {t("common.backHome")}
        </button>
      </section>
    </main>
  )
}
