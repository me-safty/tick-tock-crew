# Tick Tock Crew — plan

Original 3-player co-op bomb-defusal web game, built for play with friends. Same genre loop as other defusal games (timer, modules, strikes, asymmetric information, talk it out), but with our own roles, modules, art and rules. Do not copy names, roles, puzzles, rules or assets from existing games.

## Game

| Role | Can | Can't |
| --- | --- | --- |
| **Operator** | See and touch the bomb | Read the manual, see internals |
| **Analyst** | Read the manual | See the bomb |
| **Scanner** | See internals (X-ray, gauges, waveforms) | Touch anything |

- Exactly 3 players, one per role. Fixed seats; camera can look around (no walking).
- A match: one bomb generated from a seed with all 4 modules, 5-minute timer (difficulty presets change timer and module complexity), 3 strikes.
- Guests: nickname + anonymous sessionId in localStorage, join by 4-letter room code. Lobby: claim a seat, ready up; match starts when all 3 seats are ready.
- If a player disconnects mid-match, the match pauses until they rejoin their seat.

### Modules (MVP)

| Module | Operator | Scanner | Analyst |
| --- | --- | --- | --- |
| Hidden wires | wire colors; cuts wires | serial tags under insulation | cut rules (color × tag) |
| Glyph keypad | 4 symbols; presses keys | which key is live | glyph tables → press order |
| Pressure valve (real-time) | handle color; holds/releases valve | spring coils, live pressure gauge | safe band table (handle × coils) |
| Frequency dial | turns dial; submits | waveform overlay | waveform shape → frequency |

Glyphs and rule tables are our own designs: each glyph is a frame (circle, triangle, square, arch) with a mark inside, drawn in code; the manual groups them into four rings. The dial's waveforms are smooth, square, ramp and spike traces.

The valve's pressure slowly rises; holding the handle vents it and the needle falls. The Analyst finds the safe band (one of three 12-point bands, 6 points apart) from the handle color and the spring coils; the Operator lets go when the Scanner calls the needle inside it. Letting go outside the band, or the needle reaching 100, is a strike and puts the needle back at its start. Difficulty scales the rates: the needle spends 2.4–3 s (easy), 1.7–2.4 s (normal) or 1.3–1.7 s (hard) in the band.

## Stack

- **Bun** workspaces (no Turborepo). One pinned `effect` 4.x version shared by all packages.
- **apps/web** — Vite + React SPA, React Three Fiber + drei, Convex React client, WebRTC voice, i18next (Arabic default, English toggle). Assets: code-built primitives + Kenney CC0 models, stylized toon look.
- **packages/backend** — `convex/` (schema, functions); exports the generated `api`. Convex Cloud.
- **packages/rules** — pure Effect 4.x game logic shared by client and server: seeded PRNG, `generateBomb(seed, difficulty)`, `viewFor(bomb, role)`, action validation, valve simulation.
- **Tests** — Vitest everywhere, run via `bun run test` (convex-test needs Vite's `import.meta.glob`, so not `bun test`). `@effect/vitest` for rules, `convex-test` for key mutations (cut wire, strike, explode, win).
- **Effect in Convex** — plain Convex handlers with `v` validators call into `packages/rules` (`Effect.runSync`), mapping tagged errors to `ConvexError` or strikes. No Confect. Keep Effect logging/clock reads out of queries so they stay cacheable.
- Hosting: static Vite build on a static host + Convex Cloud.

## Data model (sketch)

```
rooms     code, status: lobby|playing|paused|won|lost, seed, difficulty,
          endsAt, remainingMs (when paused), strikes, explodeJobId
seats     roomId, role, sessionId, name, ready
modules   roomId, index, kind, solved, progress (cuts, presses, valve since + hold/release/reset events)
pings     roomId, fromRole, target, createdAt
signals   roomId, fromRole, toRole, kind: offer|answer|ice, payload
presence  @convex-dev/presence component
```

## Key flows

- **Hidden info:** server-filtered views. `match.view` resolves the caller's seat and returns only `viewFor(bomb, role)`. The full bomb is regenerated from the seed server-side and never sent.
- **Timer:** `start` sets `endsAt` and `scheduler.runAt(endsAt, explode)`; clients render the countdown locally; `explode` no-ops unless still playing.
- **Pause:** presence detects a drop → cancel the explode job, store `remainingMs`; resume reschedules.
- **Valve:** pressure is a pure function of (seed, start, hold/release/reset events) in `packages/rules`. Queries return the events and gauge parameters, never a current pressure. The Scanner animates it in `useFrame` with a server-clock offset (lowest-RTT of 5 calls to the `serverTime` mutation). `holdValve` and `releaseValve` stamp server time on arrival; the release recomputes the pressure and solves or strikes. Tolerance: the band plus 250 ms of venting either side. Hold and release are both delayed by the trip to the server, so steady latency cancels out (left over: rise × latency, about 0.02 points at 150 ms); the window covers the Scanner's call and the Operator's reaction. An untended valve bursts at 100: `scheduleBurst` schedules `burstValve` after every change, and the job recomputes, so a stale one does nothing.
- **Voice:** 3-way P2P WebRTC mesh; signaling via the `signals` table (filtered by recipient, deleted after read); Cloudflare TURN credentials minted by a Convex action.
- **Pings:** point-at pings and quick emotes synced through Convex.

## Milestones

1. **Scaffold** — Bun workspace, Vite + R3F app, Convex in packages/backend, rules package, Vitest.
2. **Lobby** — create/join by code, seat claim, ready, presence.
3. **Rules core + wires** — PRNG, bomb gen, role views, strikes, timer, win/explode, with tests.
4. **3D scene** — table + bomb from primitives and Kenney CC0 props, seat cameras, wire interaction, Analyst manual UI, Scanner X-ray.
5. **Arabic localization** — Arabic default (RTL), English toggle, i18next, Western digits.
6. **Other modules**
   - 6a **Keypad + dial** — Glyph keypad and Frequency dial.
   - 6b **Pressure valve** — real-time valve, server-clock offset, burst job.
7. **Voice + pings** — WebRTC mesh, Cloudflare TURN, pings and emotes.
8. **Crew characters** — first-person; the other two players visible as original characters who turn, point to highlight objects, gesture, emote and take short walks between spots; motion synced over the M7 WebRTC data channel; Kenney CC0 rigged models; the Analyst's booth has a window with blinds hiding the bomb.
9. **Polish + deploy** — pause/reconnect, difficulty presets, deploy.

Then a full-game QA pass.

From M6 on, every new user-facing string ships in both `ar` and `en` (`apps/web/src/i18n/locales`), and new backend errors are codes in `packages/backend/convex/errors.ts` with a translation in both.

## Risks

- WebRTC is the hardest to debug; it lands late, so play over Discord until then.
- Guest sessionIds are spoofable — fine for friends, not public play.
- Valve feel depends on clock-offset accuracy; fallback is a wider window.
