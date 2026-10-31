import { Component, type ReactNode } from "react"

type Props = { readonly children: ReactNode }
type State = { readonly failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="screen">
        <section className="panel">
          <h1>Something went wrong</h1>
          <p className="muted">The page hit an unexpected error.</p>
          <button type="button" className="button primary" onClick={() => window.location.assign("/")}>
            Back to home
          </button>
        </section>
      </main>
    )
  }
}
