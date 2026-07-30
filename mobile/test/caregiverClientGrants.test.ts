import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..", "..");
const migration = readFileSync(
  join(root, "supabase", "migrations", "20260724103000_harden_caregiver_client_grants.sql"),
  "utf8",
);
const api = readFileSync(
  join(root, "mobile", "src", "serverless", "babyBossSupabaseApi.ts"),
  "utf8",
);

test("보호자 직접 조회 권한은 앱이 사용하는 공개 컬럼으로만 제한한다", () => {
  assert.match(migration, /revoke all privileges on table public\.caregivers from authenticated;/i);
  assert.match(migration, /grant select \([\s\S]*?chat_notifications_enabled,[\s\S]*?updated_at[\s\S]*?\) on table public\.caregivers to authenticated;/i);
  assert.doesNotMatch(
    migration.match(/grant select \([\s\S]*?\) on table public\.caregivers to authenticated;/i)?.[0] ?? "",
    /\b(?:password_hash|pin_hash)\b/i,
  );
  assert.doesNotMatch(migration, /grant select, insert, update on table public\.caregivers to authenticated;/i);
});

test("직접 수정은 프로필 편집 컬럼으로만 제한한다", () => {
  const updateGrant = migration.match(/grant update \([\s\S]*?\) on table public\.caregivers to authenticated;/i)?.[0] ?? "";

  assert.match(updateGrant, /\bname\b/i);
  assert.match(updateGrant, /\bimage_url\b/i);
  assert.doesNotMatch(updateGrant, /\b(?:password_hash|pin_hash|role|contact_phone|push_notifications_enabled|chat_notifications_enabled)\b/i);
  assert.doesNotMatch(migration, /grant insert on table public\.caregivers to authenticated;/i);
});

test("모바일 보호자 조회 필드는 최소 권한 select grant와 일치한다", () => {
  const selectedFields = api.match(/const caregiverSelectFields\s*=\s*\n?\s*"([^"]+)"/)?.[1].split(",") ?? [];

  assert.deepEqual(selectedFields, [
    "id",
    "family_id",
    "auth_user_id",
    "email",
    "name",
    "role",
    "availability_score",
    "fatigue_score",
    "image_url",
    "contact_phone",
    "push_notifications_enabled",
    "chat_notifications_enabled",
  ]);
  assert.doesNotMatch(selectedFields.join(","), /(?:password_hash|pin_hash)/i);
});

test("알림 설정 RPC는 legacy hash를 응답으로 반환하지 않는다", () => {
  assert.match(migration, /returns public\.caregivers\s+language plpgsql\s+security definer\s+set search_path = public/i);
  assert.match(migration, /v_updated\.pin_hash := '';/);
  assert.match(migration, /v_updated\.password_hash := '';/);
});

test("현재 앱의 직접 보호자 수정과 개인정보 RPC는 축소된 권한 모델을 따른다", () => {
  const profileUpdate = api.match(/export async function updateCaregiverProfile[\s\S]*?\n}\n\nexport async function updateCaregiverPersonalInfo/)?.[0] ?? "";
  const personalInfoUpdate = api.match(/export async function updateCaregiverPersonalInfo[\s\S]*?\n}\n\nexport async function createSchedule/)?.[0] ?? "";

  assert.match(profileUpdate, /patch\.name =/);
  assert.match(profileUpdate, /patch\.image_url =/);
  assert.doesNotMatch(profileUpdate, /patch\.(?:password_hash|pin_hash|role|contact_phone)/);
  assert.match(personalInfoUpdate, /supabase\.auth\.updateUser\(\{\s*password:/s);
  assert.match(personalInfoUpdate, /p_current_password: null/);
  assert.match(personalInfoUpdate, /p_new_password: null/);
});
