#!/usr/bin/env bash
set -euo pipefail

# This script deliberately supports an isolated local PostgreSQL target only.
# It refuses the production project reference and requires explicit confirmation.
umask 077

ARCHIVE_PATH="${1:-}"
TEMP_DIR=""
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORAGE_POLICY_FILE="$ROOT_DIR/scripts/family_media_storage_policies.sql"
RESTORE_CLEAR_FILE="$ROOT_DIR/scripts/clear_isolated_supabase_restore_data.sql"
LOCAL_SUPABASE_PROJECT="${ILOG_LOCAL_SUPABASE_PROJECT:-$(basename "$ROOT_DIR")}"
LOCAL_DB_CONTAINER=""
LOCAL_DATABASE_NAME=""
LOCAL_DATABASE_USER=""

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

for command in openssl tar shasum; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command" >&2
    exit 1
  }
done

if [[ ! -s "$STORAGE_POLICY_FILE" || ! -s "$RESTORE_CLEAR_FILE" ]]; then
  echo "A required isolated restore companion file is missing." >&2
  exit 1
fi

run_psql() {
  if command -v psql >/dev/null 2>&1; then
    psql "$ILOG_ISOLATED_DATABASE_URL" "$@"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Either psql or Docker is required to restore the isolated database." >&2
    exit 1
  fi

  if [[ -z "$LOCAL_DB_CONTAINER" ]]; then
    LOCAL_DB_CONTAINER="$(docker ps --filter "label=com.supabase.cli.project=$LOCAL_SUPABASE_PROJECT" --format '{{.Names}}' | grep '^supabase_db_' | head -n 1 || true)"
  fi

  if [[ -z "$LOCAL_DB_CONTAINER" ]]; then
    echo "Could not find the local Supabase database container. Install psql or start the local Supabase stack." >&2
    exit 1
  fi

  if [[ -z "$LOCAL_DATABASE_NAME" ]]; then
    LOCAL_DATABASE_NAME="${ILOG_ISOLATED_DATABASE_URL%%\?*}"
    LOCAL_DATABASE_NAME="${LOCAL_DATABASE_NAME##*/}"
  fi

  if [[ -z "$LOCAL_DATABASE_USER" ]]; then
    local authority
    authority="${ILOG_ISOLATED_DATABASE_URL#*://}"
    authority="${authority%%@*}"
    LOCAL_DATABASE_USER="${authority%%:*}"
    [[ -n "$LOCAL_DATABASE_USER" ]] || LOCAL_DATABASE_USER="postgres"
  fi

  if [[ ! "$LOCAL_DATABASE_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "The Docker fallback supports only a local PostgreSQL database name in ILOG_ISOLATED_DATABASE_URL." >&2
    exit 1
  fi

  docker exec -i "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DATABASE_USER" -d "$LOCAL_DATABASE_NAME" "$@"
}

run_data_restore_psql() {
  if command -v psql >/dev/null 2>&1; then
    psql "$ILOG_ISOLATED_DATABASE_URL" "$@"
    return
  fi

  if [[ -z "$LOCAL_DB_CONTAINER" ]]; then
    LOCAL_DB_CONTAINER="$(docker ps --filter "label=com.supabase.cli.project=$LOCAL_SUPABASE_PROJECT" --format '{{.Names}}' | grep '^supabase_db_' | head -n 1 || true)"
  fi

  if [[ -z "$LOCAL_DB_CONTAINER" ]]; then
    echo "Could not find the local Supabase database container. Install psql or start the local Supabase stack." >&2
    exit 1
  fi

  if [[ -z "$LOCAL_DATABASE_NAME" ]]; then
    LOCAL_DATABASE_NAME="${ILOG_ISOLATED_DATABASE_URL%%\?*}"
    LOCAL_DATABASE_NAME="${LOCAL_DATABASE_NAME##*/}"
  fi

  # Local Supabase's Storage metadata is owned by supabase_storage_admin. The
  # regular local postgres role can create schema but cannot COPY those rows.
  docker exec -i "$LOCAL_DB_CONTAINER" psql \
    -U "${ILOG_LOCAL_DATA_RESTORE_USER:-supabase_admin}" \
    -d "$LOCAL_DATABASE_NAME" \
    "$@"
}

emit_backup_data() {
  if [[ "${ILOG_SKIP_STORAGE_OBJECT_METADATA:-}" != "yes" ]]; then
    cat "$TEMP_DIR/data.sql"
    return
  fi

  # The companion Storage restore recreates storage.objects from the backed-up
  # file payloads. Omitting these rows avoids duplicate object versions when a
  # local Storage API upload follows this database restore.
  awk '
    /^COPY "storage"\."objects" / { skipping = 1; next }
    skipping && $0 == "\\." { skipping = 0; next }
    !skipping { print }
  ' "$TEMP_DIR/data.sql"
}

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

if [[ "${ILOG_SKIP_SCHEMA_RESTORE:-}" == "yes" ]]; then
  echo "Skipping schema restore because the isolated local stack was initialized from migrations..."
else
  echo "Restoring schema into the isolated local database..."
  run_psql -v ON_ERROR_STOP=1 <"$TEMP_DIR/schema.sql"
fi

echo "Clearing local-only authentication, presence, and Storage data before restoring backup rows..."
echo "Restoring data with triggers temporarily disabled for known circular references..."
{
  # The local auth and Storage schemas protect direct writes with triggers.
  # The companion file clears only the tables restored by this backup, and this
  # isolated restore session temporarily disables those triggers.
  cat "$RESTORE_CLEAR_FILE"
  emit_backup_data
} | run_data_restore_psql -v ON_ERROR_STOP=1

echo "Reapplying family-media Storage RLS policies..."
run_psql -v ON_ERROR_STOP=1 < "$STORAGE_POLICY_FILE"

echo "Isolated database restore completed. Roles are intentionally not restored."
