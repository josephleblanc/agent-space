# Integration test checklist (Track G3)

Manual end-to-end verification: **voice → Vapi webhook → InsForge edge functions → Postgres (or mock) → room-state poll → Bevy movement**.

Run through this list before a judge demo or after merging track branches.

## Prerequisites

- [ ] Rust 1.89+ and `wasm32-unknown-unknown` target (`rust-toolchain.toml` handles this)
- [ ] Trunk 0.21.14: `cargo install --locked trunk --version 0.21.14`
- [ ] Node 20+ in `web/` (`npm install`)
- [ ] Deno 1.40+ for local edge functions
- [ ] Optional: `VAPI_API_KEY`, `VITE_VAPI_PUBLIC_KEY`, `NEBIUS_API_KEY`, `INSFORGE_API_KEY` (see `.env.example`)

Copy env template:

```bash
cp .env.example .env
# Fill VITE_VAPI_PUBLIC_KEY, VITE_INSFORGE_URL, etc.
```

## 1. Backend smoke (offline OK)

```bash
cd insforge
deno task check
deno task dev
```

In another terminal:

| Step | Command | Expected |
|------|---------|----------|
| Room snapshot | `curl -s http://127.0.0.1:8787/functions/room-state \| jq '.agents \| length'` | `4` |
| Agent chat | `curl -s -X POST http://127.0.0.1:8787/functions/agent-chat -H 'Content-Type: application/json' -d '{"agent_id":"agent-researcher","message":"Hello"}' \| jq '.speech'` | Non-empty speech string |
| Webhook tool | `curl -s -X POST http://127.0.0.1:8787/functions/vapi-webhook -H 'Content-Type: application/json' -d '{"message":{"type":"tool-calls","toolCallList":[{"id":"t1","function":{"name":"get_room_status","arguments":{}}}]}}' \| jq '.results[0].result.active_tasks'` | Number (0+ when DB/mock) |

- [ ] All three endpoints return HTTP 200
- [ ] `room-state` JSON matches `RoomSnapshot` shape (`agents[]`, `tasks[]`)
- [ ] `assign_task` via webhook moves agent state in response / subsequent poll (when DB wired)

## 2. Release build (Track G4)

From repo root:

```bash
cd web
npm run build
unset NO_COLOR   # Trunk 0.21.14 rejects NO_COLOR=1 in some CI shells
trunk build --release
```

Verify:

- [ ] Build completes without errors
- [ ] `dist/` exists at repo root (Trunk `dist = "../dist"`)
- [ ] `dist/index.html` and hashed WASM/JS assets present
- [ ] Total `dist/` size is reasonable for demo (~15–40 MB with glTF assets is normal)
- [ ] Optional: `python3 -m http.server -d dist 9000` — page loads, splash clears, 3D room renders

**Troubleshooting**

| Issue | Fix |
|-------|-----|
| `invalid value '1' for '--no-color'` | `unset NO_COLOR` before running Trunk |
| `file not found for module state` | Ensure `crates/game/src/state.rs` exists on `main` |
| `wasm-opt` validation error on release build | Set `data-wasm-opt="0"` on the Trunk rust link in `web/index.html` (Bevy 0.18 + wasm-opt 123) |
| Voice disabled in UI | Set `VITE_VAPI_PUBLIC_KEY` and re-run `npm run build` |

## 3. Browser shell + polling

Terminal 1 — edge functions:

```bash
cd insforge && deno task dev
```

Terminal 2 — Trunk (proxy optional; direct URL also works):

```bash
export VITE_INSFORGE_URL=http://127.0.0.1:8787
cd web && npm run build && trunk serve
```

Open `http://127.0.0.1:8080`.

- [ ] Loading splash hides; Bevy canvas shows room + 4 agents
- [ ] Agent roster sidebar lists Researcher, Coder, Planner, Social
- [ ] Network tab: `room-state` polls every ~500 ms (200 OK)
- [ ] Dev inject (`?dev` or localhost): keyboard `1`–`4` triggers mock walking states

## 4. Voice path (requires Vapi keys)

Terminal 3 — webhook tunnel (production-like):

```bash
export VAPI_API_KEY=<server-key>
vapi listen --forward-to http://127.0.0.1:8787/functions/vapi-webhook
```

With `VITE_VAPI_PUBLIC_KEY` set and Trunk rebuilt:

- [ ] **Start voice** mic button is enabled (not grayed out)
- [ ] Click mic → browser prompts for microphone; call starts
- [ ] Say *"What's the room status?"* → concierge calls `get_room_status`; spoken summary mentions agents
- [ ] Say *"Hey Researcher, summarize Rust WASM performance"* → `talk_to_agent` → agent reply spoken via TTS
- [ ] Say *"Coder, go write a hello world at the code station"* → `assign_task` → Coder state becomes walking/working in roster + 3D scene
- [ ] End call via mic button; UI returns to idle

## 5. Full chain (voice → movement)

After a successful `assign_task` voice command:

- [ ] `room-state` shows updated `agent.state` (`walking` → `working`) and task row
- [ ] Bevy avatar for that agent walks toward station (path + lerp)
- [ ] Agent enters **Working** animation at destination
- [ ] Concurrent commands to the same agent do not corrupt state (second command waits or returns busy — see `concurrency.ts`)

## 6. Cloud deploy smoke (optional, needs `INSFORGE_API_KEY`)

Skip if no API key — local checklist above is sufficient for merge.

```bash
npx @insforge/cli login   # uses INSFORGE_API_KEY
npx @insforge/cli link
npx @insforge/cli functions deploy room-state --file insforge/functions/room-state/index.ts
# … agent-chat, vapi-webhook (see insforge/README.md)

# Set persistent deployment env vars (required for voice + room-state in production)
npx @insforge/cli deployments env set VITE_INSFORGE_URL https://<APPKEY>.<region>.insforge.app
npx @insforge/cli deployments env set VITE_VAPI_PUBLIC_KEY <your-vapi-public-key>
npx @insforge/cli deployments env list   # verify both keys are present

# Source deploy: InsForge uploads repo and runs scripts/vercel-build.sh on Vercel (WASM too large for direct upload)
npx @insforge/cli deployments deploy .
```

`scripts/vercel-build.sh` exports `VITE_INSFORGE_URL` (with fallbacks to `INSFORGE_URL` / `OSS_HOST` / project OSS host) and passes through `VITE_VAPI_PUBLIC_KEY` before `npm run build`, so `web/js/env.js` is baked into the hosted bundle.

Verify after deploy:

```bash
curl -s https://<APPKEY>.insforge.site/js/env.js | grep VITE_INSFORGE_URL
# value should be non-empty (do not paste secrets into tickets)
```

- [ ] Deployed URL loads WASM room
- [ ] `js/env.js` has non-empty `VITE_INSFORGE_URL` (and `VITE_VAPI_PUBLIC_KEY` when voice is required)
- [ ] Room-state hits cloud edge functions (not localhost)
- [ ] Voice works against deployed webhook URL

## Production URLs (agent-space-insforge)

| Surface | URL |
|---------|-----|
| InsForge API (edge functions) | `https://6ns446hp.us-west.insforge.app` |
| `room-state` | `https://6ns446hp.us-west.insforge.app/functions/room-state` |
| `agent-chat` | `https://6ns446hp.us-west.insforge.app/functions/agent-chat` |
| `vapi-webhook` | `https://6ns446hp.us-west.insforge.app/functions/vapi-webhook` |
| Hosted WASM shell | `https://6ns446hp.insforge.site` |

Cloud smoke (2026-06-19): `room-state` returns **4** agents (HTTP 200). `agent-chat` for `agent-researcher` returns non-empty `speech` without the canned `(LLM offline; using canned reply.)` suffix. `get_room_status` via `vapi-webhook` returns `{ results: [{ toolCallId, result: { agents, tasks, active_tasks } }] }` when `X-Vapi-Secret` matches deployment `PRIVATE_VAPI_API_KEY` / `VAPI_API_KEY` (unauthenticated calls get HTTP 401).

## Sign-off

| Area | Owner | Pass? | Notes |
|------|-------|-------|-------|
| Edge functions | Track C | Yes | Cloud smoke on API base above; see Production URLs |
| Browser poll + bridge | Track B | Partial | Shell at `https://6ns446hp.insforge.site`; verify `js/env.js` has non-empty `VITE_INSFORGE_URL` after latest deploy |
| Bevy movement | Track A | | Local / hosted manual |
| Voice + tools | Track D | Yes | `get_room_status` tool shape verified on cloud webhook |
| Nebius replies + DB | Track E | Yes | Researcher cloud reply is live LLM speech (not canned offline) |
| Release build | Track G | | CI + `scripts/vercel-build.sh` on InsForge deploy |
