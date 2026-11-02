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

## Deploy

The web app is hosted on Vercel and the backend on Convex Cloud. Every push to `main` deploys both: Vercel runs [`scripts/vercel-build.sh`](scripts/vercel-build.sh) (set as the build command in [`vercel.json`](vercel.json)), which pushes the Convex functions to the deployment its deploy key names and then builds `apps/web` with `VITE_CONVEX_URL` pointing there. Vercel serves `apps/web/dist`, and every path falls back to `index.html`, so links like `/room/ABCD` open the room.

| Where | Variable | What |
| --- | --- | --- |
| Vercel, Production only | `CONVEX_DEPLOY_KEY` | A production deploy key from the Convex dashboard (production deployment → Settings → Generate Production Deploy Key, with `deployment:deploy`). |
| Convex production deployment (optional) | `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` | Cloudflare TURN credentials for voice. Without them voice uses public STUN only, so players behind strict NATs may not connect. Set them with `bunx convex env set --prod <NAME> <value>` in `packages/backend`. |

The build stops with an error when `CONVEX_DEPLOY_KEY` is missing, and when a preview build has a production key, so a preview can never point at the dev deployment or push a branch to production. Preview builds are skipped (`ignoreCommand` in `vercel.json`), so only `main` deploys. To enable them, remove that line and give Vercel's Preview environment a Convex preview deploy key.

To redeploy, push to `main`, or use Redeploy on the latest deployment in Vercel; both run the same build. To push only the Convex functions by hand, run `CONVEX_DEPLOY_KEY=<production key> bunx convex deploy` in `packages/backend`.

| Path | What |
| --- | --- |
| `apps/web` | Vite + React + React Three Fiber client |
| `packages/backend` | Convex functions in `convex/`; exports the generated `api` |
| `packages/rules` | Pure Effect game logic shared by client and server |
