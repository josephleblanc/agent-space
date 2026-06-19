#!/usr/bin/env bash
# Vercel / InsForge remote build: Rust WASM (Trunk) + browser env bundle.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Resolve VITE_* for remote builds. InsForge `deployments env set` injects these into
# Vercel; fall back to platform aliases and the linked project OSS host.
if [[ -z "${VITE_INSFORGE_URL:-}" ]]; then
  VITE_INSFORGE_URL="${INSFORGE_URL:-${OSS_HOST:-${INSFORGE_OSS_HOST:-}}}"
fi
if [[ -z "${VITE_INSFORGE_URL:-}" && -n "${INSFORGE_APPKEY:-${APPKEY:-}}" && -n "${INSFORGE_REGION:-${REGION:-}}" ]]; then
  VITE_INSFORGE_URL="https://${INSFORGE_APPKEY:-$APPKEY}.${INSFORGE_REGION:-$REGION}.insforge.app"
fi
if [[ -z "${VITE_INSFORGE_URL:-}" ]]; then
  VITE_INSFORGE_URL="https://6ns446hp.us-west.insforge.app"
fi
export VITE_INSFORGE_URL
export VITE_VAPI_PUBLIC_KEY="${VITE_VAPI_PUBLIC_KEY:-}"

# Remote Vercel builders OOM on full Bevy WASM release builds; prefer .deploy-dist static deploy.
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-1}"
export CARGO_PROFILE_RELEASE_LTO="${CARGO_PROFILE_RELEASE_LTO:-false}"

echo "[vercel-build] VITE_INSFORGE_URL=$( [[ -n "$VITE_INSFORGE_URL" ]] && echo set || echo missing )"
echo "[vercel-build] VITE_VAPI_PUBLIC_KEY=$( [[ -n "$VITE_VAPI_PUBLIC_KEY" ]] && echo set || echo missing )"

if ! command -v cargo &>/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.89
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
fi

rustup target add wasm32-unknown-unknown

if ! command -v trunk &>/dev/null; then
  cargo install trunk --locked --version 0.21.14
fi

cd web
npm run build
unset NO_COLOR
trunk build --release

# Regenerate env.js with exported VITE_* before bundling (Trunk pre_build may have run earlier).
node scripts/write-env.js

# Trunk dist omits [[copy]] js/assets in release; bundle them for hosting.
cp -a js "$ROOT/dist/js"
cp -a "$ROOT/assets" "$ROOT/dist/assets"

test -f ../dist/index.html
echo "[vercel-build] dist/ ready ($(du -sh ../dist | cut -f1))"
