#!/usr/bin/env bash
set -euo pipefail

umask 077

ARCHIVE_PATH="${1:-}"
TEMP_DIR=""

if [[ -z "$ARCHIVE_PATH" || ! -f "$ARCHIVE_PATH" ]]; then
  echo "Usage: ILOG_BACKUP_PASSPHRASE=... $0 /absolute/path/to/ilog-supabase-storage-*.tar.gz.enc" >&2
  exit 1
fi

if [[ -z "${ILOG_BACKUP_PASSPHRASE:-}" ]]; then
  echo "ILOG_BACKUP_PASSPHRASE is required and must never be committed or logged." >&2
  exit 1
fi

for command in openssl tar shasum; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command" >&2
    exit 1
  }
done

CHECKSUM_PATH="$ARCHIVE_PATH.sha256"
if [[ -f "$CHECKSUM_PATH" ]]; then
  (cd "$(dirname "$ARCHIVE_PATH")" && shasum -a 256 -c "$(basename "$CHECKSUM_PATH")")
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ilog-supabase-storage-verify.XXXXXX")"
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

(cd "$TEMP_DIR" && shasum -a 256 -c archive-contents.sha256)
(cd "$TEMP_DIR" && shasum -a 256 -c family-media.sha256)

echo "Storage backup decrypts successfully and every archived object matches its checksum."
echo "Restore only into an isolated validation project after its bucket policies are prepared."
