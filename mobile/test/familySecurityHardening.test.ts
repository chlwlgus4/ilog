import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..", "..");
const migration = readFileSync(
  join(
    repositoryRoot,
    "supabase",
    "migrations",
    "20260902101134_harden_family_updates_and_oauth_invites.sql",
  ),
  "utf8",
);

function functionBody(name: string) {
  const match = migration.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );

  assert.ok(match, `${name} 함수 정의를 찾지 못했습니다.`);
  return match[0];
}

test("가족 직접 수정 권한은 아침 브리핑 설정 컬럼으로만 제한한다", () => {
  assert.match(
    migration,
    /revoke update on table public\.families from authenticated;/i,
  );

  const updateGrant = migration.match(
    /grant update \([\s\S]*?\)\s*on table public\.families\s*to authenticated;/i,
  )?.[0] ?? "";

  assert.match(updateGrant, /\bmorning_briefing_enabled\b/i);
  assert.doesNotMatch(
    updateGrant,
    /\b(?:owner_caregiver_id|deletion_requested_at|deletion_scheduled_for|deletion_requested_by_auth_user_id|subscription_plan|invite_code|name)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /grant update on (?:table )?public\.families to authenticated;/i,
  );
});

test("기존 owner-null 가족은 가장 먼저 등록된 보호자를 대표자로 backfill한다", () => {
  assert.match(migration, /select distinct on \(caregiver\.family_id\)/i);
  assert.match(migration, /order by caregiver\.family_id, caregiver\.id/i);
  assert.match(
    migration,
    /update public\.families as family[\s\S]*?set owner_caregiver_id = first_caregiver\.id[\s\S]*?family\.owner_caregiver_id is null;/i,
  );
});

test("신규 보호자 trigger는 owner-null 가족만 최초 보호자로 초기화한다", () => {
  const triggerFunction = functionBody(
    "assign_first_family_owner_after_caregiver_insert",
  );

  assert.match(triggerFunction, /security definer\s+set search_path = ''/i);
  assert.match(
    triggerFunction,
    /where caregiver\.family_id = new\.family_id[\s\S]*?order by caregiver\.id[\s\S]*?limit 1/i,
  );
  assert.match(
    triggerFunction,
    /where family\.id = new\.family_id\s+and family\.owner_caregiver_id is null/i,
  );
  assert.match(
    migration,
    /after insert on public\.caregivers\s+for each row\s+execute function public\.assign_first_family_owner_after_caregiver_insert\(\);/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.assign_first_family_owner_after_caregiver_insert\(\)\s+from public, anon, authenticated;/i,
  );
});

test("OAuth 초대 조회는 output family_id와 충돌하지 않도록 별칭을 사용한다", () => {
  const oauthFunction = functionBody("complete_oauth_caregiver");

  assert.match(
    oauthFunction,
    /returns table\(caregiver_id bigint, family_id bigint, child_id bigint\)/i,
  );
  assert.match(oauthFunction, /security definer\s+set search_path = ''/i);
  assert.match(
    oauthFunction,
    /from public\.family_invitations as invitation\s+where invitation\.family_id = v_family\.id/i,
  );
  assert.match(oauthFunction, /lower\(invitation\.email\) = v_email/i);
  assert.match(oauthFunction, /invitation\.status = 'PENDING'/i);
  assert.doesNotMatch(oauthFunction, /where\s+family_id\s*=/i);
  assert.match(oauthFunction, /from auth\.users as auth_user/i);
  assert.match(oauthFunction, /from public\.caregivers as caregiver/i);
  assert.match(oauthFunction, /from public\.families as family/i);
  assert.match(oauthFunction, /from public\.children as child/i);
});

test("OAuth 내부 함수 직접 실행은 막고 consent wrapper 계약은 건드리지 않는다", () => {
  assert.match(
    migration,
    /revoke all on function public\.complete_oauth_caregiver\(text\)\s+from public, anon, authenticated;/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.complete_oauth_caregiver\(text\) to authenticated;/i,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.complete_oauth_caregiver_with_consent/i,
  );
  assert.match(
    functionBody("complete_oauth_caregiver"),
    /provider\.value in \('google', 'apple'\)[\s\S]*?status = 'ACCEPTED'[\s\S]*?return query\s+select v_caregiver\.id, v_caregiver\.family_id, v_child\.id;/i,
  );
});
