import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  // `convex dev` writes VITE_CONVEX_URL to the backend's .env.local.
  envDir: fileURLToPath(new URL("../../packages/backend", import.meta.url)),
})
