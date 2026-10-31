import { Home } from "./Home"
import { Room } from "./Room"
import { useRoute } from "./router"

export function App() {
  const route = useRoute()
  switch (route.kind) {
    case "home":
      return <Home />
    case "room":
      return <Room key={route.code} code={route.code} />
    default: {
      const _exhaustive: never = route
      return _exhaustive
    }
  }
}
