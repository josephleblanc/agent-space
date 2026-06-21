# agent-space

Digital hangout space for agents — a WASM Bevy 3D room with voice-driven AI agents.

## Documentation

| Doc | Purpose |
|-----|---------|
| **[`docs/OVERVIEW.md`](docs/OVERVIEW.md)** | **Start here** — architecture, repo map, remote services, what works today, gaps & next steps |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | Manual end-to-end integration checklist (voice → webhook → DB → Bevy) |
| [`docs/STRETCH.md`](docs/STRETCH.md) | Multimodal on-demand asset generation (Track H) |
| [`insforge/README.md`](insforge/README.md) | Edge functions, local Deno dev server, backend deploy |

## Prerequisites

- Rust **1.89+** (pinned via `rust-toolchain.toml`, includes `wasm32-unknown-unknown`)
- [Trunk](https://trunkrs.dev/) **0.21.14** (pinned; install with a locked version):

  ```bash
  cargo install --locked trunk --version 0.21.14
  ```

- Optional for `cargo run --target wasm32-unknown-unknown`: [wasm-server-runner](https://github.com/jakobhellermann/wasm-server-runner)

  ```bash
  cargo install wasm-server-runner
  ```

## Development

### Native (fast iteration)

```bash
cargo run -p game
```

### WASM (WebGL2)

```bash
cd web
npm install
npm run build   # bundle @vapi-ai/web + inject VITE_* from .env
trunk serve
```

Open `http://127.0.0.1:8080`. The loading splash hides once Trunk finishes booting WASM.

#### Voice (Vapi, Track D)

Set `VITE_VAPI_PUBLIC_KEY` in `.env` (see `.env.example`). For local tool-call routing, run `deno task dev` in `insforge/` and forward webhooks:

```bash
vapi listen --forward-to http://127.0.0.1:8787/functions/vapi-webhook
```

See `insforge/README.md` for the full local voice workflow.

Release build (Track G4):

```bash
cd web
npm run build
unset NO_COLOR   # required if NO_COLOR=1 is set in your shell (Trunk 0.21.14)
trunk build --release
```

Output lands in `dist/`. `trunk build` / `trunk serve` alone now produce a complete,
runnable bundle: `web/index.html` uses `<link data-trunk rel="copy-dir" …>` to copy
`web/js/` → `dist/js/` and repo-root `assets/` → `dist/assets/`. (Trunk silently ignores
`[[copy]]` tables in `Trunk.toml`, so those were removed in favour of the copy-dir links.)

See `docs/INTEGRATION.md` for the full release-build checklist.

## Deployment

**Canonical path — InsForge static hosting (Vercel-backed):**

```bash
# 1. Release build (self-contained dist/ with js/ + assets/ via Trunk copy-dir)
cd web && npm run build && unset NO_COLOR && trunk build --release && cd ..

# 2. Stage .deploy-dist/: gzip the WASM in place + add vercel.json
bash scripts/prepare-deploy-bundle.sh

# 3. Deploy the staged static bundle
npx @insforge/cli deployments deploy .deploy-dist
```

- **Command that deploys:** `npx @insforge/cli deployments deploy .deploy-dist`.
- **Host:** InsForge static hosting, served via InsForge's Vercel-backed CDN at
  `https://<APPKEY>.insforge.site` (this project: `https://6ns446hp.insforge.site`).
  Edge functions live separately at the API base `https://6ns446hp.us-west.insforge.app`.
- **Deploy `.deploy-dist/`, not `dist/` directly.** The raw release WASM (~29 MB) exceeds
  InsForge's OSS upload limit (HTTP 413) and `dist/` has no `vercel.json`, so it would lack
  the SPA rewrites and the gzip header below.

### Env vars baked into the bundle

Browser-safe `VITE_*` vars are embedded into `js/env.js` (read at runtime as `window.__ENV__`):

| Var | Purpose |
|-----|---------|
| `VITE_INSFORGE_URL` | API base for room-state polling + edge-function calls |
| `VITE_VAPI_PUBLIC_KEY` | Vapi public/client key for the voice button |

Set them once as persistent deployment vars, then they are injected at deploy time:

```bash
npx @insforge/cli deployments env set VITE_INSFORGE_URL https://<APPKEY>.<region>.insforge.app
npx @insforge/cli deployments env set VITE_VAPI_PUBLIC_KEY <your-vapi-public-key>
```

`scripts/deploy-vercel.json` (copied into `.deploy-dist/vercel.json`) declares
`buildCommand: node scripts/inject-deploy-env.js`. On deploy, Vercel runs that script to
rewrite `js/env.js` from the persistent `deployments env` vars — **no Rust/WASM recompile**
(which would OOM on Vercel builders). Locally, `npm run build` / `scripts/write-env.js`
already bakes the same vars from your `.env`.

### How the gzip-WASM header is satisfied

`scripts/prepare-deploy-bundle.sh` gzips `*_bg.wasm` **in place** (so the file on disk is
gzip bytes, ~8 MB for release). `scripts/deploy-vercel.json` then serves it with:

```json
{ "key": "Content-Type", "value": "application/wasm" },
{ "key": "Content-Encoding", "value": "gzip" }
```

so the browser transparently decompresses it. The same file also sets `no-cache` on
`/js/*` (so `env.js` is always fresh) and an SPA rewrite of `/(.*) → /index.html`.

### scripts/ reference

| File | Role |
|------|------|
| `scripts/prepare-deploy-bundle.sh` | Stages `dist/` → `.deploy-dist/`, gzips WASM, adds `vercel.json` + `inject-deploy-env.js`. **Run before deploy.** |
| `scripts/deploy-vercel.json` | The `vercel.json` shipped in the bundle: gzip-WASM header, `/js/*` no-cache, SPA rewrite, `buildCommand`. |
| `scripts/inject-deploy-env.js` | Vercel `buildCommand`; rewrites `js/env.js` from deployment env vars (no compile). |
| `scripts/vercel-build.sh` | **Source-deploy alternative**: full remote Rust+Trunk build on Vercel. OOMs on Bevy WASM release, so the staged `.deploy-dist` path above is preferred. |
| `web/scripts/write-env.js` | Local: writes `web/js/env.js` from `.env` `VITE_*` (run by `npm run build` + Trunk `pre_build`). |

See `insforge/README.md` for backend (edge function) setup and deploy troubleshooting.

## Judge demo script (Track G6)

**Setup (~2 min before judges arrive)**

1. **Cloud (preferred):** open the InsForge-hosted URL with `VITE_*` vars baked in at deploy time.
2. **Local fallback:** three terminals:
   - `cd insforge && deno task dev`
   - `export VITE_INSFORGE_URL=http://127.0.0.1:8787 && cd web && npm run build && trunk serve`
   - Optional voice tunnel: `export VAPI_API_KEY=… && vapi listen --forward-to http://127.0.0.1:8787/functions/vapi-webhook`
3. Set `VITE_VAPI_PUBLIC_KEY` in `.env`, rebuild (`npm run build`), refresh the page.
4. Confirm four avatars idle in the room and the agent roster is visible.

**Demo flow (~3 min)**

| # | Say this (example) | What judges should see |
|---|-------------------|------------------------|
| 1 | *(click **Start voice**)* "What's going on in the room?" | Concierge calls `get_room_status`; spoken summary of four agents |
| 2 | "Hey Researcher, look into Rust WASM performance." | Researcher replies via TTS; avatar may enter **Talking** |
| 3 | "Send Coder to the code station to write a hello world." | `assign_task` → Coder walks to code bench → **Working** |
| 4 | "Planner, what's our next step for the hackathon demo?" | Planner responds with a short plan |
| 5 | "Social, coordinate a quick stand-up at the meet station." | Social assigned toward **meet** station |
| 6 | *(optional)* "What's the room status now?" | Updated task count and agent states |

**Without microphone:** use dev inject on localhost — press `2` for walking Coder, `3` for working Planner (`?dev` enables the panel). Narrate that voice uses the same `room-state` → Bevy path.

**If voice fails live:** keep Trunk + edge functions running; show curl webhook responses from `docs/INTEGRATION.md` and dev keyboard presets to prove movement sync.

## Workspace layout

| Path | Track | Purpose |
|------|-------|---------|
| `crates/protocol` | B | Frozen JSON contract (Rust) |
| `crates/game` | A | Bevy WASM client |
| `web/` | A/B/D | Trunk shell, HTML/CSS, JS bridges (api-client, vapi-bridge) |
| `insforge/` | C | Edge functions + Postgres schema |
| `docs/INTEGRATION.md` | G | Manual integration test checklist |
| `assets/` | F | CC0 glTF avatars and room props |

## Parallel tracks

Each track works on its own branch (`track/a-bevy`, `track/b-shell`, …). Wave 0 lands the shared protocol on `main` before tracks branch off.

## Environment

Copy `.env.example` to `.env` when Track G adds deployment variables. Never commit secrets.
