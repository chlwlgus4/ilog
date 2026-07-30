#!/usr/bin/env bash
set -euo pipefail

# This script never uses --linked. It resets only the local Supabase stack,
# applies the complete local migration chain, then rolls back the RLS fixtures.
#
# Two historical production migrations deliberately require pre-existing state:
# a Vault secret for the push worker and a legacy password account to migrate.
# The disposable fixtures below let a fresh local database validate those paths
# without weakening the production safeguards or touching a linked project.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIR=""

cleanup() {
  [[ -n "$TEMP_DIR" ]] && rm -rf "$TEMP_DIR"
}

trap cleanup EXIT

cd "$ROOT_DIR"

if ! npx supabase status >/dev/null 2>&1; then
  echo "The local Supabase stack is not running. Start it first with: npx supabase start" >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required to run the local RLS isolation SQL fixture." >&2
  exit 1
}

LOCAL_DB_CONTAINER="$(docker ps --filter "label=com.supabase.cli.project=$(basename "$ROOT_DIR")" --format '{{.Names}}' | grep '^supabase_db_' | head -n 1 || true)"

if [[ -z "$LOCAL_DB_CONTAINER" ]]; then
  echo "Could not find the local Supabase database container." >&2
  exit 1
fi

local_psql() {
  docker exec -i "$LOCAL_DB_CONTAINER" psql -U postgres -d postgres "$@"
}

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ilog-local-migration-validation.XXXXXX")"

run_until_expected_guard() {
  local expected_message="$1"
  local log_path="$2"
  shift 2

  if "$@" >"$log_path" 2>&1; then
    echo "Expected local validation guard did not run: $expected_message" >&2
    exit 1
  fi

  if ! grep -Fq "$expected_message" "$log_path"; then
    cat "$log_path" >&2
    exit 1
  fi

  echo "Verified expected local-only migration guard: $expected_message"
}

cat >"$TEMP_DIR/local-push-worker-secret.sql" <<'SQL'
do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'babyboss_push_worker_cron_secret'
  ) then
    perform vault.create_secret(
      'local-validation-only',
      'babyboss_push_worker_cron_secret'
    );
  end if;
end;
$$;
SQL

cat >"$TEMP_DIR/local-legacy-password-fixture.sql" <<'SQL'
do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-00000000f001';
  v_family_id bigint;
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'legacy-fixture@example.test',
    '',
    now(),
    '{"provider":"email","providers":[]}',
    '{}',
    now(),
    now()
  );

  insert into public.families(name, invite_code)
  values ('Legacy migration fixture', 'LEGACY-LOCAL-FIXTURE')
  returning id into v_family_id;

  insert into public.caregivers(
    family_id,
    auth_user_id,
    name,
    role,
    email,
    password_hash
  ) values (
    v_family_id,
    v_user_id,
    'Legacy fixture',
    'GUARDIAN',
    'legacy-fixture@example.test',
    '$2a$10$M9v2t7TnGvKrq7pH3aRjNeaYAlzG4u7e1xBPY2ZL4C1Slw8d5KyzG'
  );
end;
$$;
SQL

echo "Resetting the local database and verifying production-only migration guards..."
run_until_expected_guard \
  'babyboss_push_worker_cron_secret Vault secret must be created before this migration runs.' \
  "$TEMP_DIR/push-worker-guard.log" \
  npx supabase db reset --local --no-seed

echo "Adding a disposable local push-worker secret and continuing the migration chain..."
local_psql -v ON_ERROR_STOP=1 -f - <"$TEMP_DIR/local-push-worker-secret.sql"

run_until_expected_guard \
  'No legacy password accounts were found' \
  "$TEMP_DIR/legacy-password-guard.log" \
  npx supabase migration up --local

echo "Adding a disposable legacy account fixture and completing the migration chain..."
local_psql -v ON_ERROR_STOP=1 -f - <"$TEMP_DIR/local-legacy-password-fixture.sql"
npx supabase migration up --local

echo "Verifying that the legacy migration created an email identity..."
local_psql -At -c \
  "select provider from auth.identities where user_id = '00000000-0000-0000-0000-00000000f001' and provider = 'email';" \
  | grep -Fq 'email'

echo "Running two-family RLS and Storage isolation checks in the local database..."
local_psql -v ON_ERROR_STOP=1 -f - <supabase/tests/family_rls_isolation.sql

echo "Local migration and isolation validation completed. No linked production project was used."
