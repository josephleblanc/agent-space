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
trunk serve
```

Open `http://127.0.0.1:8080`. The loading splash hides once Trunk finishes booting WASM.

Release build:

```bash
cd web
trunk build --release
```

Output lands in `dist/`.

## Workspace layout

| Path | Track | Purpose |
|------|-------|---------|
| `crates/protocol` | B | Frozen JSON contract (Rust) |
| `crates/game` | A | Bevy WASM client |
| `web/` | A/B | Trunk shell, HTML/CSS, JS bridges |
| `insforge/` | C | Edge functions + Postgres schema |
| `assets/` | F | CC0 glTF avatars and room props |

## Parallel tracks

Each track works on its own branch (`track/a-bevy`, `track/b-shell`, …). Wave 0 lands the shared protocol on `main` before tracks branch off.

## Environment

Copy `.env.example` to `.env` when Track G adds deployment variables. Never commit secrets.
