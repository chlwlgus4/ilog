#!/usr/bin/env bash
set -euo pipefail

# Creates a database-only production backup. Storage object bytes are not part
# of a Postgres dump and must be recovered separately from Supabase Storage.
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$HOME/Library/Application Support/ilog/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_PATH="$OUTPUT_DIR/ilog-supabase-db-$TIMESTAMP.tar.gz.enc"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"
TEMP_DIR=""

if [[ -z "${ILOG_BACKUP_PASSPHRASE:-}" ]]; then
  echo "ILOG_BACKUP_PASSPHRASE is required and must never be committed or logged." >&2
  exit 1
fi

for command in npx openssl tar shasum; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command" >&2
    exit 1
  }
done

mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ilog-supabase-backup.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

cd "$ROOT_DIR"

echo "Creating an encrypted database backup from the linked Supabase project..."
npx supabase db dump --linked --file "$TEMP_DIR/schema.sql"
npx supabase db dump --linked --data-only --use-copy --file "$TEMP_DIR/data.sql"
npx supabase db dump --linked --role-only --file "$TEMP_DIR/roles.sql"
npx supabase migration list --linked > "$TEMP_DIR/migration-history.txt"

find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print0 \
  | sort -z \
  | xargs -0 shasum -a 256 > "$TEMP_DIR/local-migrations.sha256"

cat > "$TEMP_DIR/README.txt" <<EOF
아이로그 Supabase 데이터베이스 백업
created_at_utc=$TIMESTAMP
scope=Postgres schema, Postgres data, database roles, remote migration history, local migration checksums
storage_object_payloads=not_included
restore_target=isolated validation project or local Supabase only
production_restore=prohibited
EOF

(
  cd "$TEMP_DIR"
  shasum -a 256 schema.sql data.sql roles.sql migration-history.txt local-migrations.sha256 README.txt > archive-contents.sha256
  tar -czf - schema.sql data.sql roles.sql migration-history.txt local-migrations.sha256 README.txt archive-contents.sha256
) | openssl enc -aes-256-cbc -pbkdf2 -iter 210000 -salt \
  -pass env:ILOG_BACKUP_PASSPHRASE \
  -out "$ARCHIVE_PATH"

shasum -a 256 "$ARCHIVE_PATH" > "$CHECKSUM_PATH"
chmod 600 "$ARCHIVE_PATH" "$CHECKSUM_PATH"

echo "Encrypted database backup created: $ARCHIVE_PATH"
echo "Checksum created: $CHECKSUM_PATH"
echo "Run scripts/verify_encrypted_supabase_backup.sh before relying on this backup."
echo "Important: Supabase Storage object bytes are not included in a database dump."
