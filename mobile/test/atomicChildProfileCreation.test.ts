import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const mobileRoot = join(import.meta.dirname, "..");
const repositoryRoot = join(mobileRoot, "..");
const migration = readFileSync(
  join(
    repositoryRoot,
    "supabase",
    "migrations",
    "20260902113803_atomic_child_profile_creation.sql",
  ),
  "utf8",
);
const api = readFileSync(
  join(mobileRoot, "src", "serverless", "babyBossSupabaseApi.ts"),
  "utf8",
);

function createChildClientSource() {
  const start = api.indexOf("export async function createChildProfile");
  const end = api.indexOf("export async function updateCaregiverProfile", start);

  assert.ok(start >= 0 && end > start, "아이 생성 클라이언트 구현을 찾지 못했습니다.");
  return api.slice(start, end);
}

test("아이 생성 클라이언트는 아이와 초기 몸무게를 RPC 한 번으로 전달한다", () => {
  const source = createChildClientSource();

  assert.match(source, /supabase\.rpc\("create_child_profile_checked",\s*\{/);
  assert.match(source, /p_family_id:\s*familyId/);
  assert.match(source, /p_name:\s*payload\.name\.trim\(\)/);
  assert.match(source, /p_birth_date:\s*payload\.birthDate/);
  assert.match(source, /p_stage:\s*payload\.stage/);
  assert.match(source, /p_gender:\s*payload\.gender/);
  assert.match(source, /p_weight_kg:\s*payload\.weightKg \?\? null/);
  assert.match(source, /p_image_url:\s*payload\.imageUrl \?\? null/);
  assert.doesNotMatch(source, /\.from\("children"\)\s*\.insert/);
  assert.doesNotMatch(source, /record_child_profile_weight_checked/);
});

test("아이 생성 RPC는 호출자 RLS를 유지하면서 현재 가족만 허용한다", () => {
  assert.match(migration, /language plpgsql\s+security invoker\s+set search_path = ''/i);
  assert.match(migration, /v_current := public\.current_caregiver\(\);/i);
  assert.match(
    migration,
    /if v_current\.family_id is distinct from p_family_id then\s+raise exception 'Family access denied';/i,
  );
  assert.doesNotMatch(migration, /security definer/i);
});

test("아이 생성 RPC는 필수값과 허용 enum 및 몸무게 범위를 검증한다", () => {
  assert.match(migration, /if p_family_id is null or p_family_id <= 0 then/i);
  assert.match(migration, /if v_name = '' then/i);
  assert.match(migration, /if p_birth_date is null then/i);
  assert.match(
    migration,
    /p_stage not in \(\s*'NEWBORN',\s*'INFANT',\s*'TODDLER',\s*'PRESCHOOL',\s*'EARLY_SCHOOL'\s*\)/i,
  );
  assert.match(migration, /p_gender not in \('MALE', 'FEMALE'\)/i);
  assert.match(migration, /p_weight_kg <= 0 or p_weight_kg > 9999\.99/i);
  assert.match(migration, /v_requested_weight numeric\(6,2\)/i);
  assert.match(migration, /v_requested_weight := p_weight_kg/i);
  assert.match(migration, /v_requested_weight is not null and v_requested_weight <= 0/i);
});

test("아이와 선택적 초기 몸무게 INSERT는 예외를 삼키지 않는 같은 함수 안에 있다", () => {
  const childInsert = migration.indexOf("insert into public.children");
  const growthInsert = migration.indexOf("insert into public.growth_measurements");

  assert.ok(childInsert >= 0, "아이 INSERT를 찾지 못했습니다.");
  assert.ok(growthInsert > childInsert, "초기 몸무게 INSERT가 아이 INSERT 뒤에 있어야 합니다.");
  assert.match(
    migration.slice(childInsert, growthInsert),
    /returning \* into v_child;[\s\S]*if v_requested_weight is not null then/i,
  );
  assert.match(migration.slice(growthInsert), /v_child\.id[\s\S]*v_current\.id/);
  assert.doesNotMatch(migration, /exception\s+when/i);
});

test("아이 생성 RPC는 가족별 잠금과 기존 행 재사용으로 이중 탭·응답 손실 재시도를 멱등 처리한다", () => {
  const functionStart = migration.indexOf(
    "create or replace function public.create_child_profile_checked",
  );
  const functionSql = migration.slice(functionStart);
  const lock = functionSql.indexOf("pg_catalog.pg_advisory_xact_lock");
  const existingLookup = functionSql.indexOf("from public.children child");
  const childInsert = functionSql.indexOf("insert into public.children");

  assert.ok(lock >= 0, "가족별 transaction lock이 필요합니다.");
  assert.ok(existingLookup > lock, "잠금 뒤 기존 아이를 다시 확인해야 합니다.");
  assert.ok(childInsert > existingLookup, "기존 아이 확인 뒤에만 INSERT해야 합니다.");
  assert.match(migration, /'ilog:create-child-profile:' \|\| p_family_id::text/);
  assert.match(
    migration,
    /create unique index if not exists idx_children_one_profile_per_family\s+on public\.children\(family_id\)/i,
  );
  assert.match(migration, /Duplicate child profiles must be resolved/i);
  assert.match(migration, /growth\.note = '아이 정보에서 등록'/i);
  assert.match(migration, /v_requested_weight is null and v_initial_weight_count = 0/i);
  assert.match(migration, /v_initial_weight is not distinct from v_requested_weight/i);
  assert.match(migration, /if found then[\s\S]*return v_child/);
  assert.match(migration, /A child profile already exists for this family/);
});

test("아이 생성 RPC는 익명 실행을 막고 authenticated에만 공개한다", () => {
  assert.match(
    migration,
    /revoke all on function public\.create_child_profile_checked\([\s\S]*?\) from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_child_profile_checked\([\s\S]*?\) to authenticated;/i,
  );
  assert.doesNotMatch(migration, /drop function public\.record_child_profile_weight_checked/i);
  assert.doesNotMatch(migration, /revoke insert on (?:table )?public\.children from authenticated/i);
});
