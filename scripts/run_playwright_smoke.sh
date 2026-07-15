#!/usr/bin/env bash
set -euo pipefail

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI="${PWCLI:-$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh}"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required to run Playwright CLI."
  exit 1
fi

if [ ! -x "$PWCLI" ]; then
  echo "Playwright CLI wrapper not found: $PWCLI"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/output/playwright/smoke}"
APP_URL="${APP_URL:-http://127.0.0.1:19006}"
SESSION="${PLAYWRIGHT_CLI_SESSION:-ilog-smoke}"
FLOW_FILE="$ROOT_DIR/scripts/playwright_smoke_flow.js"
PHOTO_UPLOAD_SETUP_FILE="$ROOT_DIR/scripts/playwright_photo_upload_setup.js"
PHOTO_UPLOAD_SECOND_PICK_FILE="$ROOT_DIR/scripts/playwright_photo_upload_second_pick.js"
PHOTO_UPLOAD_THIRD_PICK_FILE="$ROOT_DIR/scripts/playwright_photo_upload_third_pick.js"
PHOTO_UPLOAD_VERIFY_FILE="$ROOT_DIR/scripts/playwright_photo_upload_verify.js"
PHOTO_UPLOAD_FIXTURE="$ROOT_DIR/mobile/assets/ilog-logo.png"
PHOTO_UPLOAD_SECONDARY_FIXTURE="$ROOT_DIR/mobile/assets/ilog-logo-transparent.png"
CHAT_IMAGE_SETUP_FILE="$ROOT_DIR/scripts/playwright_chat_image_setup.js"
CHAT_IMAGE_VERIFY_FILE="$ROOT_DIR/scripts/playwright_chat_image_verify.js"

mkdir -p "$OUTPUT_DIR"

cleanup() {
  "$PWCLI" --session "$SESSION" close >/dev/null 2>&1 || true
}

trap cleanup EXIT

run_pwcli() {
  local output

  if ! output="$("$PWCLI" --session "$SESSION" "$@" 2>&1)"; then
    printf '%s\n' "$output"
    return 1
  fi

  printf '%s\n' "$output"

  if printf '%s\n' "$output" | grep -q '^### Error'; then
    return 1
  fi
}

pushd "$OUTPUT_DIR" >/dev/null

run_pwcli open "$APP_URL"
run_pwcli run-code --filename "$FLOW_FILE"
run_pwcli run-code --filename "$PHOTO_UPLOAD_SETUP_FILE"
run_pwcli upload "$PHOTO_UPLOAD_FIXTURE"
run_pwcli run-code --filename "$PHOTO_UPLOAD_SECOND_PICK_FILE"
run_pwcli upload "$PHOTO_UPLOAD_SECONDARY_FIXTURE"
run_pwcli run-code --filename "$PHOTO_UPLOAD_THIRD_PICK_FILE"
run_pwcli upload "$PHOTO_UPLOAD_FIXTURE"
run_pwcli run-code --filename "$PHOTO_UPLOAD_VERIFY_FILE"
run_pwcli run-code --filename "$CHAT_IMAGE_SETUP_FILE"
run_pwcli upload "$PHOTO_UPLOAD_FIXTURE"
run_pwcli run-code --filename "$CHAT_IMAGE_VERIFY_FILE"
run_pwcli screenshot

popd >/dev/null

echo "Smoke flow passed."
echo "App URL: $APP_URL"
echo "Artifacts directory: $OUTPUT_DIR"
