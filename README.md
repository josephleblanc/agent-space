# agent-space

A **WASM Bevy 3D hangout** where voice-controlled AI agents move through a shared room. The browser runs a fixed isometric Bevy scene (WebGL2); a thin JavaScript shell handles mic capture and Vapi voice I/O; InsForge hosts the static bundle, Postgres, and edge functions; Nebius powers agent reasoning on the server.

## Architecture

```text
Browser (Bevy WASM + Vapi JS)  →  InsForge (hosting, edge functions, Postgres)
                                        ↓
                              Vapi cloud (STT/TTS)  +  Nebius (LLM)
```

Vapi cannot run inside pure Rust/WASM (WebRTC/mic), so the split is intentional: Bevy owns the 3D scene; JS forwards structured events via `wasm-bindgen`.

## Prerequisites

| Tool | Version / notes |
|------|-----------------|
| **Rust** | **1.89+** (see `rust-toolchain.toml` when present) |
| **wasm32 target** | `rustup target add wasm32-unknown-unknown` |
| **Trunk** | [trunkrs.dev](https://trunkrs.dev/) — WASM build and dev server |
| **Node.js** | For InsForge CLI and local edge-function dev |
| **Vapi CLI** | Optional, for local webhook forwarding (`vapi listen`) |

Mic capture requires a **secure context** (HTTPS or `localhost`). Do not test the mic over a LAN IP.

## Environment variables

Copy the example file and fill in values from each sponsor dashboard:

```bash
cp .env.example .env
```

| Variable | Scope | Used by |
|----------|-------|---------|
| `VITE_VAPI_PUBLIC_KEY` | Browser-safe | Vapi SDK init in the client bundle |
| `VITE_INSFORGE_URL` | Browser-safe | Room-state polling, API base URL |
| `VITE_INSFORGE_ANON_KEY` | Browser-safe (optional) | Direct InsForge client calls, if needed |
| `VAPI_API_KEY` | **Server-only** | Edge functions, `vapi listen` webhook auth |
| `INSFORGE_API_KEY` | **Server-only** | InsForge CLI login, link, deploy |
| `NEBIUS_API_KEY` | **Server-only** | `agent-chat` edge function (never in the browser) |

See [`.env.example`](.env.example) for inline comments on each variable.

## Local development

### 1. Rust / WASM toolchain

```bash
rustup target add wasm32-unknown-unknown
```

Install Trunk (pin the version documented in `rust-toolchain.toml` / CI when available):

```bash
cargo install trunk
```

### 2. Run the game client

From the repo root (once Track A lands `web/Trunk.toml`):

```bash
trunk serve web/index.html
```

Open the URL Trunk prints (typically `http://127.0.0.1:8080`). Press the mic button to satisfy browser autoplay / AudioContext requirements.

### 3. InsForge backend (Track C)

```bash
# Authenticate (uses INSFORGE_API_KEY)
npx @insforge/cli login

# Link this repo to your InsForge project
npx @insforge/cli link

# Apply schema and seed data (when insforge/ exists)
# npx @insforge/cli db push
# npx @insforge/cli db seed

# Deploy static WASM bundle (after trunk build --release)
# npx @insforge/cli deployments deploy ./dist \
#   --env VITE_VAPI_PUBLIC_KEY=... \
#   --env VITE_INSFORGE_URL=...
```

Set **InsForge secrets** for server-only keys (never in `VITE_*`):

- `NEBIUS_API_KEY` — Nebius Token Factory LLM
- `VAPI_API_KEY` — Vapi server / webhook verification

Local edge-function dev (Track C9) proxies `/api/*` from Trunk to a local InsForge dev server.

### 4. Vapi local webhook forwarding (Track D)

Point Vapi tool-call webhooks at your local InsForge function while developing:

```bash
vapi listen --forward-to http://localhost:<port>/vapi-webhook
```

Use your **server** `VAPI_API_KEY` for CLI auth. The browser only needs `VITE_VAPI_PUBLIC_KEY` (public client key).

### 5. Nebius (server-side only)

Nebius provides an OpenAI-compatible API at `https://api.tokenfactory.nebius.com` (or the Token Factory endpoint configured in Track E). The API key lives **only** in InsForge secrets and the `agent-chat` edge function — it must never appear in client code, `.env` files committed to git, or `VITE_*` build variables.

## Parallel track structure

Work is split across **seven parallel tracks** (A–G), each on its own git branch/worktree, merging into `main`. Track **H** is a stretch goal after core integration.

| Track | Focus |
|-------|--------|
| **A** | Bevy WASM client — scene, agents, movement, Rust bridge |
| **B** | Protocol types + JS shell — api-client, game-bridge, UI overlay |
| **C** | InsForge — schema, edge functions, secrets, local dev |
| **D** | Vapi — ephemeral inline assistant, SDK, tools, TTS |
| **E** | Nebius agent brains + backend adapters |
| **F** | CC0 assets — Kenney avatars, room props, manifest |
| **G** | Docs, env, deploy, demo script, CI |
| **H** | *(stretch)* Multimodal on-demand asset generation |

**Wave 0** (on `main` first): frozen `crates/protocol` + TypeScript mirror, toolchain pins, and worktree setup. All tracks code against that shared JSON contract (`RoomSnapshot`, `AgentSnapshot`, etc.).

## Sponsor services

This hackathon integrates three prize-track services:

| Service | Role in agent-space |
|---------|---------------------|
| **[InsForge](https://insforge.app)** | Static hosting for the WASM bundle, Postgres (agents/tasks/messages), edge functions (`room-state`, `agent-chat`, `vapi-webhook`), secrets, and stretch asset storage |
| **[Vapi](https://vapi.ai)** | Browser voice I/O — mic capture, STT, TTS (`vapi.say()`), and tool-call webhooks to InsForge |
| **[Nebius](https://nebius.com)** | Server-side LLM reasoning via Token Factory (OpenAI-compatible API); stretch multimodal asset generation |

## Repository layout (target)

```text
agent-space/
├── crates/game/           # Bevy WASM client (Track A)
├── crates/protocol/       # Shared serde types (Track B)
├── web/                   # Trunk, index.html, JS bridges (Tracks A, B, D)
├── insforge/              # Schema, seed, edge functions (Track C)
├── assets/                # CC0 glTF avatars and room props (Track F)
├── .env.example           # Documented env vars (Track G)
└── README.md
```

## License

See [LICENSE](LICENSE).
