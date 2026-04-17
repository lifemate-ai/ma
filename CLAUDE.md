# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`komorebi` is a short-session mindfulness companion app. The emphasis is *calm-first*: a single persistent "companion" persona that remembers recent sessions, predicts, and reacts — not a stateless chat. Sessions include timed practices (yasashii / motto-yasashii), body scan, SBNRR, emotion-mapping, gratitude, compassion, and check-ins. Optional browser-camera "watch" turns frames into short observation notes saved to companion memory.

## Architecture

Two deployables, one codebase:

- **`ma-server/`** — Rust / Axum API. Talks to Turso (libSQL over HTTP) for persistence, OpenAI or Claude for companion replies, ElevenLabs for TTS. Uses `rust-embed` to ship `ma-web/dist/` inside the binary, so the API server also serves the SPA in production. `.env` is loaded via `dotenvy` at startup.
- **`ma-web/`** — TypeScript + Vite SPA (no framework — hand-rolled DOM). Talks to `/api/*` on the same origin; in dev, Vite proxies `/api` to `localhost:3001`.

Key server modules (`ma-server/src/`):
- `main.rs` — builds the `AppState` (db, http, llm, JWK cache, auth config) and the axum `Router`. The same `build_app()` is reused for Lambda (`--features lambda`) and local binary targets.
- `companion/` — the persona layer. `prompt.rs` assembles prompts; `presence.rs` maintains the persistent state (memory, prediction error, GWT-style foregrounding) that lives **outside** the prompt; `openai.rs` / `claude.rs` are the provider implementations behind a `CompanionLLM` trait in `llm.rs`.
- `journal.rs`, `profile.rs`, `curriculum.rs`, `recommendations.rs`, `insights.rs` — session records, user preferences/goals, progression, and post-session recommendation / insight generation. Each migrates its own tables at startup.
- `auth.rs` — Cognito JWT verification via JWKs (cached). `AUTH_MODE=disabled` bypasses verification and injects a fixed dev user (`DEV_AUTH_SUB`).
- `tts.rs` — proxies ElevenLabs TTS (both one-shot and streaming).

Key web modules (`ma-web/src/`):
- `main.ts` — app entry, routing between screens.
- `session-engine.ts` — core state machine for a timed session (phases, companion pings, observation cadence).
- `modes/` — mode-specific flows (sbnrr, gratitude, compassion, emotion-mapping, checkin). Each is a small module driving the engine.
- `auth.ts` — Cognito Hosted UI redirect flow (or no-op when `VITE_AUTH_MODE=disabled`).
- `voice-guidance.ts`, `audio.ts` — TTS playback + timing.
- `api.ts` — thin fetch wrapper; all endpoints under `/api/*`.
- `dev-sw-cleanup.ts` — unregisters the PWA service worker in dev (service workers from prod builds intercept `/@react-refresh` etc. and break dev).

Shared protocol registry:
- `shared/protocols/registry.json` — canonical list of practice modes; `legacy-mode-map.json` maps older ids. Both server (curriculum/recommendations) and web (mode router) reference these.

### How a session flows

1. Web calls `POST /api/companion/greet` → server pulls companion state and returns an opening line.
2. During the session, web pings `POST /api/companion/guide` at phase boundaries and (if watch is on) `POST /api/companion/observe` with a camera frame → short observation stored.
3. SBNRR has its own stepwise endpoint `POST /api/companion/sbnrr-step`.
4. On close, web calls `POST /api/companion/close` + `POST /api/sessions` (and pre/post-check, events, journal). These update presence state so the *next* greet is informed.
5. `GET /api/recommendations`, `/api/insights`, `/api/curriculum/status` power the post-session surface.

### Auth modes

`AUTH_MODE` / `VITE_AUTH_MODE` must match on server and web:
- `disabled` — no login, fixed `DEV_AUTH_SUB`. Use for local dev.
- `cognito` — Hosted UI redirect + JWT verify against Cognito JWKs.

If server panics with `Invalid auth configuration: environment variable not found`, `AUTH_MODE` is unset (defaulting to `cognito`) but Cognito env vars are missing — set `AUTH_MODE=disabled` in `.env`.

### Frontend is embedded in the server binary

`ma-server` serves `ma-web/dist/` via `rust-embed`. **Frontend edits won't show up under `cargo run` alone** — you must `npm run build` first (or use `./run.sh` which does both). The `fallback(serve_static)` route also returns `index.html` for any unknown path (SPA fallback), so non-existent API paths look like they "load" but return HTML.

## Commands

Root helpers:
- `./run.sh` — production-shape: installs web deps if missing, `npm run build`, then `cargo run -p ma-server`. Serves SPA + API on `:3001`.
- `./dev.sh` — dev: runs `cargo run -p ma-server` on `:3001` **and** `vite` (which binds `5173` by default; the README notes `4173` is preferred to dodge old service workers — check `vite.config.ts` for the current port). Frontend HMR + API proxy via `/api`.

Server:
- `cargo run -p ma-server` — run the API (reads `.env`, listens on `LISTEN_ADDR` or `0.0.0.0:3001`).
- `cargo test -p ma-server` — run all server tests.
- `cargo test -p ma-server <name>` — filter tests by name.
- `cargo build -p ma-server --features lambda` — build the Lambda variant.

Web (run from `ma-web/`):
- `npm run dev` — Vite dev server.
- `npm run build` — `tsc && vite build` → outputs to `ma-web/dist/` which the server embeds.
- `npm test` — `vitest run`.
- `npm run test:watch` — watch mode.
- `npm run test:coverage` — v8 coverage (80% lines threshold on `src/modes/**/*.ts`).
- `npx vitest run src/modes/__tests__/sbnrr.test.ts` — run a single test file.

## Environment

Copy `.env.example` → `.env`. Required for the server to boot:
- `TURSO_URL`, `TURSO_TOKEN` — libSQL remote.
- `LLM_PROVIDER=openai|claude` + matching key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`).
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`.
- `AUTH_MODE` (+ `VITE_AUTH_MODE` for the frontend).

## Gotchas

- **Service worker from prod build vs. dev server**: the PWA plugin registers an SW on prod builds. After switching to dev, that SW can still be active and intercepts module requests (`/@react-refresh` → text/html). Unregister via DevTools → Application → Service Workers, or clear site data. `vite.config.ts` has `devOptions.enabled: false` to prevent new SW registrations in dev.
- **Turso is the only DB**: there's no local SQLite fallback. Each module (`journal`, `profile`, `companion`) runs its own `migrate()` on startup.
- **Migrations live in code, not files**: `ma-server/migrations/` is empty; migrations are `CREATE TABLE IF NOT EXISTS` inside each module.
- **`.env` is gitignored** — don't commit it.
- **Both server and web must agree on auth mode** — a mismatch means the SPA logs in but the server rejects the token, or vice-versa.
