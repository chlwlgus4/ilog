#!/usr/bin/env bash
set -euo pipefail

# Creates a Storage-object backup from the linked project. The archive is
# encrypted locally; no object is changed or removed from Supabase Storage.
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$HOME/Library/Application Support/ilog/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_PATH="$OUTPUT_DIR/ilog-supabase-storage-$TIMESTAMP.tar.gz.enc"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"
TEMP_DIR=""

if [[ -z "${ILOG_BACKUP_PASSPHRASE:-}" ]]; then
  echo "ILOG_BACKUP_PASSPHRASE is required and must never be committed or logged." >&2
  exit 1
fi

for command in npx openssl tar shasum find; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command" >&2
    exit 1
  }
done

mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ilog-supabase-storage-backup.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

cd "$ROOT_DIR"

echo "Downloading family-media objects from the linked Supabase project..."
npx supabase --experimental storage cp --linked --recursive ss:///family-media "$TEMP_DIR"

[[ -d "$TEMP_DIR/family-media" ]] || {
  echo "Storage backup did not create the family-media directory." >&2
  exit 1
}

OBJECT_COUNT="$(find "$TEMP_DIR/family-media" -type f | wc -l | tr -d ' ')"
(
  cd "$TEMP_DIR"
  find family-media -type f -print0 \
    | sort -z \
    | xargs -0 shasum -a 256 > family-media.sha256
)

cat > "$TEMP_DIR/README.txt" <<EOF
아이로그 Supabase Storage 백업
created_at_utc=$TIMESTAMP
bucket=family-media
object_count=$OBJECT_COUNT
scope=family photo and family chat attachment object payloads
restore_target=isolated validation project only
production_restore=prohibited
EOF

(
  cd "$TEMP_DIR"
  shasum -a 256 family-media.sha256 README.txt > archive-contents.sha256
  tar -czf - family-media family-media.sha256 README.txt archive-contents.sha256
) | openssl enc -aes-256-cbc -pbkdf2 -iter 210000 -salt \
  -pass env:ILOG_BACKUP_PASSPHRASE \
  -out "$ARCHIVE_PATH"

shasum -a 256 "$ARCHIVE_PATH" > "$CHECKSUM_PATH"
chmod 600 "$ARCHIVE_PATH" "$CHECKSUM_PATH"

echo "Encrypted Storage backup created: $ARCHIVE_PATH"
echo "Archived object count: $OBJECT_COUNT"
echo "Run scripts/verify_encrypted_supabase_storage_backup.sh before relying on this backup."
