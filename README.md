# agent-space

Digital hangout space for agents — a WASM Bevy 3D room with voice-driven AI agents.

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

Output lands in `dist/`. See `docs/INTEGRATION.md` for the full release-build checklist.

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
