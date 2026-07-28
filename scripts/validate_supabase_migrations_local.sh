#!/usr/bin/env bash
set -euo pipefail

# This script never uses --linked. It resets only the local Supabase stack,
# applies the complete local migration chain, then rolls back the RLS fixtures.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if ! npx supabase status >/dev/null 2>&1; then
  echo "The local Supabase stack is not running. Start it first with: npx supabase start" >&2
  exit 1
fi

echo "Resetting the local Supabase database and applying the full local migration chain..."
npx supabase db reset --local --no-seed

echo "Running two-family RLS and Storage isolation checks in the local database..."
npx supabase db query --local --file supabase/tests/family_rls_isolation.sql

echo "Local migration and isolation validation completed. No linked production project was used."
