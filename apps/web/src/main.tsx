import { ConvexProvider, ConvexReactClient } from "convex/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { ErrorBoundary } from "./ErrorBoundary"
import "./i18n"
import "./styles.css"

const convexUrl = import.meta.env.VITE_CONVEX_URL
if (!convexUrl) throw new Error("VITE_CONVEX_URL is not set. Run `bun run dev` once to create the Convex deployment.")

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <ConvexProvider client={new ConvexReactClient(convexUrl)}>
        <App />
      </ConvexProvider>
    </ErrorBoundary>
  </StrictMode>,
)
