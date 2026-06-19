# InsForge backend (Track C)

Postgres schema, seed data, and Deno edge functions for Agent Space room state, agent chat, and Vapi webhooks.

## Layout

```
insforge/
├── schema.sql              # agents, tasks, messages, assets (stretch stub)
├── seed.sql                # 4 agents (researcher, coder, planner, social)
├── dev-server.ts           # local Deno router
├── deno.json
└── functions/
    ├── _shared/
    │   ├── protocol.ts     # frozen JSON contract (mirrors crates/protocol)
    │   ├── cors.ts
    │   ├── db.ts
    │   ├── mock.ts         # offline RoomSnapshot from seed
    │   └── concurrency.ts  # per-agent lock + DB guard notes (C10)
    ├── room-state/         # GET  → RoomSnapshot
    ├── agent-chat/         # POST → AgentTurn skeleton
    └── vapi-webhook/       # POST → Vapi tool-call routing
```

## Prerequisites

- [Deno](https://deno.land/) 1.40+ (for local function dev)
- InsForge CLI (when you have credentials): `npx @insforge/cli`

## Local development (no InsForge login)

You can develop and test edge functions entirely offline. Without `INSFORGE_BASE_URL`, `room-state` returns the canned seed snapshot from `_shared/mock.ts`.

### 1. Start the local function server

```bash
cd insforge
deno task dev
```

Server listens on `http://127.0.0.1:8787`.

### 2. Smoke-test endpoints

```bash
# Room snapshot (mock seed when no DB)
curl -s http://127.0.0.1:8787/functions/room-state | jq

# Agent chat skeleton
curl -s -X POST http://127.0.0.1:8787/functions/agent-chat \
  -H 'Content-Type: application/json' \
  -d '{"agent_id":"agent-researcher","message":"Hello"}' | jq

# Vapi webhook tool routing (no auth when PRIVATE_VAPI_API_KEY unset)
curl -s -X POST http://127.0.0.1:8787/functions/vapi-webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [{
        "id": "call-1",
        "function": { "name": "get_room_status", "arguments": {} }
      }]
    }
  }' | jq
```

### 3. Proxy from Trunk (browser polling)

Add to `web/Trunk.toml` (Track B/G):

```toml
[[proxy]]
backend = "http://127.0.0.1:8787/functions/"
```

Then set `VITE_INSFORGE_URL=` empty or to `/functions` so `api-client.js` hits the proxy while `trunk serve` runs.

Alternatively export for direct polling:

```bash
export VITE_INSFORGE_URL=http://127.0.0.1:8787
```

## Cloud setup (requires INSFORGE_API_KEY)

Skip `insforge login` until you have a key. When ready:

```bash
npx @insforge/cli login
npx @insforge/cli link

# Schema + seed
npx @insforge/cli db import insforge/schema.sql
npx @insforge/cli db import insforge/seed.sql

# Deploy functions
npx @insforge/cli functions deploy room-state \
  --file insforge/functions/room-state/index.ts \
  --name "Room State"

npx @insforge/cli functions deploy agent-chat \
  --file insforge/functions/agent-chat/index.ts \
  --name "Agent Chat"

npx @insforge/cli functions deploy vapi-webhook \
  --file insforge/functions/vapi-webhook/index.ts \
  --name "Vapi Webhook"
```

### Secrets (Track C8 / E — set after login)

Agent chat uses **Nebius** when `NEBIUS_API_KEY` is set; otherwise it falls back to **OpenRouter** when `OPENROUTER_API_KEY` is set. If neither is set, replies use a canned offline fallback.

```bash
# LLM — prefer Nebius; OpenRouter used when Nebius key absent
npx @insforge/cli secrets add NEBIUS_API_KEY <your-nebius-key>
npx @insforge/cli secrets add OPENROUTER_API_KEY <your-openrouter-key>

# Vapi — private/server key for webhook verification (not the public client key)
npx @insforge/cli secrets add PRIVATE_VAPI_API_KEY <your-vapi-server-key>
```

The browser build uses the Vapi **public** key via `VITE_VAPI_PUBLIC_KEY` (see repo root `.env.example`). Never commit real keys.

## Function contracts

| Function | Method | Body | Response |
|----------|--------|------|----------|
| `room-state` | GET | — | `RoomSnapshot` JSON |
| `agent-chat` | POST | `{ agent_id, message, from_user? }` | `AgentTurn` JSON |
| `vapi-webhook` | POST | Vapi `tool-calls` payload | `{ results: [{ toolCallId, result }] }` |

### Vapi tools (routed in webhook skeleton)

- `get_room_status` — agent roster + active task count
- `talk_to_agent` — forwards to `agent-chat`
- `assign_task` — stub; Track E persists to Postgres

## Concurrency (C10)

`_shared/concurrency.ts` provides an in-process `withAgentLock(agentId)` used by `agent-chat` and `vapi-webhook`. For production across multiple isolates, Track E should add DB optimistic updates (`UPDATE … WHERE state IN (…)`) as documented in that file.

## Type checking

```bash
cd insforge
deno task check
```

## Vapi local webhook forwarding (Track D6)

Voice calls from the browser hit Vapi Cloud, which must reach your `vapi-webhook` edge function. For local development, forward Vapi events with the CLI:

### 1. Start local edge functions

```bash
cd insforge
deno task dev
```

### 2. Forward Vapi webhooks to the local server

In a second terminal (requires [Vapi CLI](https://docs.vapi.ai/cli) and `PRIVATE_VAPI_API_KEY`):

```bash
export PRIVATE_VAPI_API_KEY=<your-vapi-server-key>
vapi listen --forward-to http://127.0.0.1:8787/functions/vapi-webhook
```

`vapi listen` tunnels Vapi Cloud tool-call webhooks to your local Deno server. The ephemeral assistant in `web/js/vapi-bridge.js` points its `server.url` at the same endpoint (default `http://127.0.0.1:8787/functions/vapi-webhook`, or `VITE_INSFORGE_URL` + `/functions/vapi-webhook` when set).

### 3. Run the browser shell with a Vapi public key

```bash
# repo root — copy .env.example and set keys
cp .env.example .env
# VITE_VAPI_PUBLIC_KEY=<your-vapi-public-key>
# VITE_INSFORGE_URL=http://127.0.0.1:8787

cd web
npm install
npm run build   # writes js/env.js from .env

cd ..
cd web && trunk serve
```

Click **Start voice** in the UI. The mic button resumes `AudioContext`, starts an inline `vapi.start({...})` session, and routes `talk_to_agent`, `assign_task`, and `get_room_status` tool calls to `vapi-webhook`.

For production, deploy `vapi-webhook` to InsForge and set `VITE_INSFORGE_URL` to your project URL at build time. No dashboard assistant is required — all assistant config lives in `vapi-bridge.js`.
