#!/usr/bin/env bash
# Stage Trunk release output for local smoke tests (python -m http.server -d .deploy-dist).
# InsForge deploy uploads repo source and runs scripts/vercel-build.sh remotely (WASM > OSS upload limit).
# Build first: cd web && npm run build && trunk build --release
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/.deploy-dist"
DIST="$ROOT/dist"

if [[ ! -f "$DIST/index.html" ]]; then
  echo "error: $DIST/index.html missing — run npm run build && trunk build --release in web/ first" >&2
  exit 1
fi

rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"

cp -a "$DIST/." "$BUNDLE/"
cp -a "$ROOT/web/js" "$BUNDLE/js"
cp -a "$ROOT/assets" "$BUNDLE/assets"

echo "[prepare-deploy-bundle] staged $(du -sh "$BUNDLE" | cut -f1) → .deploy-dist/ (local preview only)"
