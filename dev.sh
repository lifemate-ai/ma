#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WEB_DIR="$ROOT_DIR/ma-web"

cleanup() {
  if [ "${SERVER_PID:-}" != "" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

echo "[komorebi] preparing dev dependencies..."
if [ ! -d "$WEB_DIR/node_modules" ]; then
  (cd "$WEB_DIR" && npm install)
fi

echo "[komorebi] starting API server on http://localhost:3001 ..."
(
  cd "$ROOT_DIR"
  cargo run -p ma-server
) &
SERVER_PID=$!

echo "[komorebi] starting web dev server on http://localhost:5173 ..."
cd "$WEB_DIR"
npm run dev -- --host 0.0.0.0
