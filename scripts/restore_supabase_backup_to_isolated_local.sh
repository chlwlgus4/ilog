#!/usr/bin/env bash
set -euo pipefail

# This script deliberately supports an isolated local PostgreSQL target only.
# It refuses the production project reference and requires explicit confirmation.
umask 077

ARCHIVE_PATH="${1:-}"
TEMP_DIR=""

if [[ "${ILOG_CONFIRM_ISOLATED_RESTORE:-}" != "yes" ]]; then
  echo "Set ILOG_CONFIRM_ISOLATED_RESTORE=yes only after confirming this is an empty isolated local database." >&2
  exit 1
fi

if [[ -z "$ARCHIVE_PATH" || ! -f "$ARCHIVE_PATH" ]]; then
  echo "Usage: ILOG_CONFIRM_ISOLATED_RESTORE=yes ILOG_BACKUP_PASSPHRASE=... ILOG_ISOLATED_DATABASE_URL=... $0 /absolute/path/to/ilog-supabase-db-*.tar.gz.enc" >&2
  exit 1
fi

if [[ -z "${ILOG_BACKUP_PASSPHRASE:-}" || -z "${ILOG_ISOLATED_DATABASE_URL:-}" ]]; then
  echo "ILOG_BACKUP_PASSPHRASE and ILOG_ISOLATED_DATABASE_URL are required." >&2
  exit 1
fi

if [[ "$ILOG_ISOLATED_DATABASE_URL" == *"sflxzfxoyicpiykvgcte"* ]]; then
  echo "Refusing to use the production Supabase project as a restore target." >&2
  exit 1
fi

for command in openssl tar psql shasum; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command" >&2
    exit 1
  }
done

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ilog-supabase-restore.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 210000 -salt \
  -pass env:ILOG_BACKUP_PASSPHRASE \
  -in "$ARCHIVE_PATH" \
  | tar -xzf - -C "$TEMP_DIR"

for required_file in schema.sql data.sql archive-contents.sha256; do
  [[ -s "$TEMP_DIR/$required_file" ]] || {
    echo "Backup is missing a required file: $required_file" >&2
    exit 1
  }
done

(cd "$TEMP_DIR" && shasum -a 256 -c archive-contents.sha256)

echo "Restoring schema into the isolated local database..."
psql "$ILOG_ISOLATED_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$TEMP_DIR/schema.sql"

echo "Restoring data with triggers temporarily disabled for known circular references..."
psql "$ILOG_ISOLATED_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "SET session_replication_role = replica" \
  -f "$TEMP_DIR/data.sql"

echo "Isolated database restore completed. Roles are intentionally not restored."
