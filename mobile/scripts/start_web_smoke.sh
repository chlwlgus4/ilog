#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-19006}"

cd "$ROOT_DIR"
CI="${CI:-1}" npm run web -- --port "$PORT"
