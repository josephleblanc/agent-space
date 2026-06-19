#!/usr/bin/env bash
# Vercel / InsForge remote build: Rust WASM (Trunk) + browser env bundle.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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

# Trunk dist omits [[copy]] js/assets in release; bundle them for hosting.
cp -a js "$ROOT/dist/js"
cp -a "$ROOT/assets" "$ROOT/dist/assets"

test -f ../dist/index.html
echo "[vercel-build] dist/ ready ($(du -sh ../dist | cut -f1))"
