# Tick Tock Crew

A 3-player online co-op bomb-defusal game for the browser. Each player holds a different slice of the information; talk it through before the timer runs out.

Stack: Bun workspaces · Vite + React + React Three Fiber · Convex · Effect 4.

See [docs/plan.md](docs/plan.md) for the design and milestones.

## Develop

```sh
bun install
bun run setup      # once: log in to Convex, pick or create the project, push functions
bun run dev        # Convex dev deployment + Vite on http://localhost:5173
bun run test       # Vitest in every package (not `bun test`)
bun run typecheck
```

`bun run setup` writes `packages/backend/.env.local` (`CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`), which the web app reads. Run it before the first `bun run dev`: `dev` runs without a terminal prompt, so without that file `convex dev` would quietly start an anonymous local backend instead of asking you to log in.

| Path | What |
| --- | --- |
| `apps/web` | Vite + React + React Three Fiber client |
| `packages/backend` | Convex functions in `convex/`; exports the generated `api` |
| `packages/rules` | Pure Effect game logic shared by client and server |
