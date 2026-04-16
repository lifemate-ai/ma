#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WEB_DIR="$ROOT_DIR/ma-web"

echo "[komorebi] preparing frontend build..."
if [ ! -d "$WEB_DIR/node_modules" ]; then
  (cd "$WEB_DIR" && npm install)
fi

(cd "$WEB_DIR" && npm run build)

echo "[komorebi] starting server on http://localhost:3001 ..."
cd "$ROOT_DIR"
exec cargo run -p ma-server "$@"
