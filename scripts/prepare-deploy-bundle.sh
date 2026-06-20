#!/usr/bin/env bash
# Stage Trunk release output for InsForge static hosting (.deploy-dist/).
# WASM is gzip-compressed in-bundle (~8 MB) — raw ~29 MB hits InsForge OSS 413 limits.
# Vercel build runs only scripts/inject-deploy-env.js (no Rust) to bake VITE_* from deployment env.
# Build first: bash scripts/vercel-build.sh  OR  cd web && npm run build && trunk build --release
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/.deploy-dist"
DIST="$ROOT/dist"

if [[ ! -f "$DIST/index.html" ]]; then
  echo "error: $DIST/index.html missing — run bash scripts/vercel-build.sh first" >&2
  exit 1
fi

rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/scripts"

cp -a "$DIST/." "$BUNDLE/"
cp -a "$ROOT/web/js/." "$BUNDLE/js/"
cp -a "$ROOT/assets" "$BUNDLE/assets"
cp "$ROOT/scripts/deploy-vercel.json" "$BUNDLE/vercel.json"
cp "$ROOT/scripts/inject-deploy-env.js" "$BUNDLE/scripts/inject-deploy-env.js"

WASM=( "$BUNDLE"/*_bg.wasm )
if [[ ! -f "${WASM[0]}" ]]; then
  echo "error: no *_bg.wasm in bundle" >&2
  exit 1
fi

RAW_SIZE=$(stat -c%s "${WASM[0]}")
gzip -9 -c "${WASM[0]}" > "${WASM[0]}.gz"
mv "${WASM[0]}.gz" "${WASM[0]}"
GZ_SIZE=$(stat -c%s "${WASM[0]}")
echo "[prepare-deploy-bundle] wasm ${RAW_SIZE} → gzip ${GZ_SIZE} bytes"

echo "[prepare-deploy-bundle] staged $(du -sh "$BUNDLE" | cut -f1) → .deploy-dist/"
