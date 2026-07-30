#!/usr/bin/env bash
set -euo pipefail

# Restore and verify family-media payloads in an isolated local Supabase stack.
# This script never accepts a linked or remote Storage target.
umask 077

ARCHIVE_PATH="${1:-}"
TEMP_DIR=""
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_PROJECT_DIR="${ILOG_LOCAL_SUPABASE_WORKDIR:-$ROOT_DIR}"

if [[ "${ILOG_CONFIRM_ISOLATED_STORAGE_RESTORE:-}" != "yes" ]]; then
  echo "Set ILOG_CONFIRM_ISOLATED_STORAGE_RESTORE=yes only after confirming the target is an isolated local Supabase stack." >&2
  exit 1
fi

if [[ -z "$ARCHIVE_PATH" || ! -f "$ARCHIVE_PATH" ]]; then
  echo "Usage: ILOG_CONFIRM_ISOLATED_STORAGE_RESTORE=yes ILOG_BACKUP_PASSPHRASE=... ILOG_LOCAL_SUPABASE_WORKDIR=... $0 /absolute/path/to/ilog-supabase-storage-*.tar.gz.enc" >&2
  exit 1
fi

if [[ -z "${ILOG_BACKUP_PASSPHRASE:-}" ]]; then
  echo "ILOG_BACKUP_PASSPHRASE is required." >&2
  exit 1
fi

for command in npx openssl tar shasum find xargs; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command" >&2
    exit 1
  }
done

if [[ ! -f "$LOCAL_PROJECT_DIR/supabase/config.toml" ]]; then
  echo "ILOG_LOCAL_SUPABASE_WORKDIR must point to an isolated local Supabase project." >&2
  exit 1
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ilog-supabase-storage-restore.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 210000 -salt \
  -pass env:ILOG_BACKUP_PASSPHRASE \
  -in "$ARCHIVE_PATH" \
  | tar -xzf - -C "$TEMP_DIR"

for required_file in family-media.sha256 README.txt archive-contents.sha256; do
  [[ -s "$TEMP_DIR/$required_file" ]] || {
    echo "Backup is missing a required file: $required_file" >&2
    exit 1
  }
done

(cd "$TEMP_DIR" && shasum -a 256 -c archive-contents.sha256 >/dev/null)
(cd "$TEMP_DIR" && shasum -a 256 -c family-media.sha256 >/dev/null)

echo "Uploading family-media payloads to the isolated local Storage stack..."
npx supabase --experimental storage cp --local --workdir "$LOCAL_PROJECT_DIR" \
  --recursive "$TEMP_DIR/family-media" ss:///

echo "Downloading the isolated copy for checksum verification..."
mkdir "$TEMP_DIR/restored"
npx supabase --experimental storage cp --local --workdir "$LOCAL_PROJECT_DIR" \
  --recursive ss:///family-media "$TEMP_DIR/restored"

(cd "$TEMP_DIR/restored" && shasum -a 256 -c "$TEMP_DIR/family-media.sha256" >/dev/null)

echo "Isolated Storage restore completed. Every family-media payload matches its encrypted backup checksum."
