import { api } from "@tick-tock-crew/backend/api"
import { useQuery } from "convex/react"
import { Scene } from "./Scene"

export function App() {
  const health = useQuery(api.health.health)
  return (
    <>
      <Scene />
      <div className="overlay">Convex health: {health ?? "connecting…"}</div>
    </>
  )
}
