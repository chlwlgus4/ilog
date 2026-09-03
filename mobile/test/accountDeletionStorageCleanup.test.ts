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
    "20260902101137_queue_family_deletion_storage_cleanup.sql",
  ),
  "utf8",
);
const worker = readFileSync(
  join(
    repositoryRoot,
    "supabase",
    "functions",
    "process-account-deletions",
    "index.ts",
  ),
  "utf8",
);
const appleDeletionRaceMigration = readFileSync(
  join(
    repositoryRoot,
    "supabase",
    "migrations",
    "20260902114500_harden_apple_revocation_deletion_race.sql",
  ),
  "utf8",
);
const contentDeletionMigration = readFileSync(
  join(
    repositoryRoot,
    "supabase",
    "migrations",
    "20260902131854_delete_departing_caregiver_content.sql",
  ),
  "utf8",
);
const apiSource = readFileSync(
  join(mobileRoot, "src", "serverless", "babyBossSupabaseApi.ts"),
  "utf8",
);
const supabaseConfig = readFileSync(
  join(repositoryRoot, "supabase", "config.toml"),
  "utf8",
);
const restoredStoragePolicies = readFileSync(
  join(repositoryRoot, "scripts", "family_media_storage_policies.sql"),
  "utf8",
);
const deployment = readFileSync(join(repositoryRoot, "DEPLOYMENT.md"), "utf8");
const environmentMatrix = readFileSync(
  join(repositoryRoot, "ENVIRONMENT_MATRIX.md"),
  "utf8",
);

function migrationSection(startMarker: string, endMarker: string) {
  return sourceSection(migration, startMarker, endMarker);
}

function sourceSection(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + 1);
  assert.notEqual(start, -1, `${startMarker} is missing`);
  assert.notEqual(end, -1, `${endMarker} boundary is missing`);
  return source.slice(start, end);
}

function sqlFunction(name: string, nextName: string) {
  return migrationSection(
    `create or replace function public.${name}`,
    `create or replace function public.${nextName}`,
  );
}

test("삭제 migration은 주요 SQL delimiter와 선언을 중복하지 않는다", () => {
  const dollarBlockStarts = migration.match(/(?:as|do)\s+\$\$/g) ?? [];
  const dollarBlockEnds = migration.match(/\$\$;/g) ?? [];
  const cronDelimiters = migration.match(/\$cron\$/g) ?? [];

  assert.equal(dollarBlockStarts.length, dollarBlockEnds.length);
  assert.equal(cronDelimiters.length % 2, 0);
  assert.doesNotMatch(
    migration,
    /where id = v_current\.id;\s*where id = v_current\.id;/,
  );
  assert.doesNotMatch(
    migration,
    /attempt_count integer\s+attempt_count integer/,
  );
  assert.match(
    migration,
    /set metadata = coalesce\(audit\.metadata, '\{\}'::jsonb\) - 'family_name'/,
  );
  assert.match(migration, /where audit\.action = 'FAMILY_DELETED'/);
});

test("개인 탈퇴는 작성 콘텐츠를 먼저 정리하고 Apple 해지와 Auth soft-delete job을 원자적으로 예약한다", () => {
  const functionSql = sourceSection(
    contentDeletionMigration,
    "create or replace function public.request_caregiver_account_deletion_v2_checked",
    "create or replace function public.list_caregiver_account_deletion_media_paths",
  );

  assert.doesNotMatch(functionSql, /(?:update|delete\s+from)\s+storage\.objects/i);
  assert.doesNotMatch(functionSql, /delete\s+from\s+auth\.users/i);
  assert.match(functionSql, /set owner_caregiver_id = v_successor_caregiver_id/);
  assert.match(functionSql, /private\.apple_sign_in_revocation_tokens/);
  assert.match(functionSql, /then 'MANUAL_REQUIRED'\s+else 'PENDING'/);
  assert.match(functionSql, /private\.caregiver_account_deletion_jobs/);
  assert.match(functionSql, /'auth_cleanup', 'pending_soft_delete'/);
  assert.match(functionSql, /'authored_content_cleanup', 'completed'/);
  assert.doesNotMatch(functionSql, /'shared_content_retained', true/);
  assert.match(functionSql, /private\.caregiver_account_deletion_media_paths/);
  assert.match(functionSql, /delete from public\.family_photos/);
  assert.match(functionSql, /delete from public\.family_chat_messages/);
  assert.match(functionSql, /delete from public\.logs/);
  assert.match(functionSql, /delete from public\.memory_entries/);
  assert.match(functionSql, /delete from public\.tasks/);
  assert.match(functionSql, /delete from public\.schedules/);
  assert.match(functionSql, /update public\.timeline_comments/);
  assert.match(functionSql, /body = '삭제된 댓글입니다\.'/);
  assert.match(functionSql, /update public\.chat_messages/);
  assert.match(functionSql, /body = '삭제된 활동입니다\.'/);
  assert.match(functionSql, /message\.sender_id = v_current\.id/);
  assert.match(functionSql, /message\.sender_id is distinct from v_current\.id/);
  assert.match(functionSql, /message\.linked_task_id = any\(v_authored_task_ids\)/);
  assert.doesNotMatch(
    functionSql,
    /message\.sender_id = v_current\.id\s+or message\.linked_task_id/,
  );
  assert.match(functionSql, /delete from public\.caregivers/);
  const deletionLock = functionSql.indexOf("pg_catalog.pg_advisory_xact_lock");
  const familyLock = functionSql.indexOf("from public.families family");
  const caregiverRelock = functionSql.indexOf("and caregiver.family_id = v_family.id");
  assert.ok(deletionLock >= 0, "account deletion must take the Apple user lock");
  assert.ok(
    familyLock >= 0 && caregiverRelock > familyLock && deletionLock > caregiverRelock,
    "account deletion must lock family, caregiver, then the Apple user",
  );
  assert.ok(
    deletionLock < functionSql.indexOf("private.apple_sign_in_revocation_tokens"),
    "the Apple user lock must still precede revocation scheduling",
  );
  assert.ok(
    functionSql.indexOf("insert into private.caregiver_account_deletion_jobs") <
      functionSql.indexOf("delete from public.caregivers"),
    "the durable job must be committed in the same transaction before access is removed",
  );
  assert.ok(
    functionSql.indexOf("insert into private.caregiver_account_deletion_media_paths") <
      functionSql.indexOf("delete from public.family_photos"),
    "Storage paths must be durable before their public records are removed",
  );
});

test("개인 삭제 media queue와 service-role RPC는 claim token 및 Storage 제거 확인을 요구한다", () => {
  const listFunction = sourceSection(
    contentDeletionMigration,
    "create or replace function public.list_caregiver_account_deletion_media_paths",
    "create or replace function public.ack_caregiver_account_deletion_media_paths",
  );
  const ackFunction = sourceSection(
    contentDeletionMigration,
    "create or replace function public.ack_caregiver_account_deletion_media_paths",
    "create or replace function public.finalize_caregiver_account_deletion_job",
  );

  assert.match(contentDeletionMigration, /create table if not exists private\.caregiver_account_deletion_media_paths/);
  assert.match(contentDeletionMigration, /foreign key \(auth_user_id\)[\s\S]*private\.caregiver_account_deletion_jobs\(auth_user_id\)/);
  assert.match(contentDeletionMigration, /alter table private\.caregiver_account_deletion_media_paths enable row level security/);
  assert.match(listFunction, /job\.status = 'PROCESSING'/);
  assert.match(listFunction, /job\.claim_token = p_claim_token/);
  assert.match(ackFunction, /job\.status = 'PROCESSING'/);
  assert.match(ackFunction, /job\.claim_token = p_claim_token/);
  assert.match(ackFunction, /not exists \([\s\S]*from storage\.objects object/);
  assert.match(contentDeletionMigration, /grant execute on function public\.list_caregiver_account_deletion_media_paths\(uuid, uuid, integer\)[\s\S]*to service_role/);
  assert.match(contentDeletionMigration, /grant execute on function public\.ack_caregiver_account_deletion_media_paths\(uuid, uuid, text\[\]\)[\s\S]*to service_role/);
  assert.doesNotMatch(contentDeletionMigration, /delete\s+from\s+storage\.objects/i);
});

test("새 일정은 작성자를 기록하고 legacy NULL 일정만 가족 소유로 남긴다", () => {
  const scheduleFunction = sourceSection(
    contentDeletionMigration,
    "create or replace function public.create_schedule_with_chat",
    "revoke all on function public.create_schedule_with_chat",
  );

  assert.match(contentDeletionMigration, /alter table public\.schedules[\s\S]*add column if not exists created_by_id bigint/);
  assert.match(scheduleFunction, /insert into public\.schedules\([\s\S]*created_by_id/);
  assert.match(scheduleFunction, /v_current\.id/);
});

test("신규 개인 콘텐츠 insert는 현재 보호자 식별자를 필수로 기록한다", () => {
  const requestFunctionMarker =
    "create or replace function public.request_caregiver_account_deletion_v2_checked";
  const policySql = sourceSection(
    contentDeletionMigration,
    "drop policy if exists tasks_insert_member on public.tasks",
    requestFunctionMarker,
  );
  const ownerPolicies = [
    ["tasks", "created_by_id"],
    ["schedules", "created_by_id"],
    ["logs", "caregiver_id"],
    ["memory_entries", "created_by_id"],
    ["record_attachments", "created_by_id"],
    ["growth_measurements", "caregiver_id"],
    ["family_invitations", "invited_by_id"],
    ["vaccination_records", "created_by_id"],
    ["hospital_visits", "created_by_id"],
    ["record_alarm_schedules", "created_by_id"],
  ] as const;

  for (const [table, ownerColumn] of ownerPolicies) {
    const policy = sourceSection(
      policySql,
      `create policy ${table}_insert_member on public.${table}`,
      table === "record_alarm_schedules"
        ? "-- export_jobs intentionally remains unavailable"
        : `drop policy if exists ${ownerPolicies[ownerPolicies.findIndex(([candidate]) => candidate === table) + 1]?.[0]}_insert_member`,
    );

    assert.match(policy, /public\.is_family_member\(family_id\)/);
    assert.match(
      policy,
      new RegExp(`${ownerColumn} = public\\.current_caregiver_id\\(\\)`),
    );
    assert.doesNotMatch(policy, new RegExp(`${ownerColumn} is null`, "i"));
  }

  assert.match(policySql, /export_jobs intentionally remains unavailable/);
  assert.doesNotMatch(policySql, /create policy export_jobs_insert_member/);
  assert.match(
    policySql,
    /create or replace function private\.reject_caregiver_content_author_change\(\)/,
  );
  assert.match(
    policySql,
    /if current_user in \('authenticated', 'anon'\)[\s\S]*pg_catalog\.to_jsonb\(new\)[\s\S]*is distinct from \(pg_catalog\.to_jsonb\(old\) -> tg_argv\[0\]\)[\s\S]*Content author cannot be changed/,
  );
  assert.equal(
    (policySql.match(/before update of (?:created_by_id|caregiver_id|invited_by_id) on public\./g) ?? [])
      .length,
    ownerPolicies.length,
  );
});

test("가족 삭제 예약도 취소·finalize와 같은 family -> caregiver 잠금 순서를 사용한다", () => {
  const scheduleFunction = sqlFunction(
    "schedule_family_deletion_checked",
    "cancel_family_deletion_checked",
  );
  const familyLock = scheduleFunction.indexOf("from public.families family");
  const caregiverRelock = scheduleFunction.indexOf(
    "and caregiver.family_id = v_family.id",
  );

  assert.ok(familyLock >= 0 && caregiverRelock > familyLock);
  assert.doesNotMatch(scheduleFunction.slice(0, familyLock), /for update/);
  assert.match(scheduleFunction.slice(familyLock, caregiverRelock), /for update/);
  assert.match(scheduleFunction.slice(caregiverRelock), /for update/);
});

test("Apple token 저장과 Auth 삭제는 같은 사용자 잠금으로 ACTIVE 재활성화 경합을 막는다", () => {
  const storeStart = appleDeletionRaceMigration.indexOf(
    "create or replace function public.store_apple_sign_in_refresh_token",
  );
  const triggerStart = appleDeletionRaceMigration.indexOf(
    "create or replace function private.schedule_apple_token_revocation_on_auth_user_delete",
  );
  const storeFunction = appleDeletionRaceMigration.slice(storeStart, triggerStart);
  const triggerFunction = appleDeletionRaceMigration.slice(triggerStart);

  assert.ok(storeStart >= 0 && triggerStart > storeStart);
  assert.match(storeFunction, /pg_catalog\.hashtextextended\(p_auth_user_id::text, 0\)/);
  assert.match(storeFunction, /from private\.caregiver_account_deletion_jobs job/);
  assert.match(storeFunction, /Account deletion prevents Apple refresh token storage/);
  assert.ok(
    storeFunction.indexOf("pg_catalog.pg_advisory_xact_lock") <
      storeFunction.indexOf("private.caregiver_account_deletion_jobs"),
  );
  assert.ok(
    storeFunction.indexOf("private.caregiver_account_deletion_jobs") <
      storeFunction.indexOf("revocation_state = 'ACTIVE'"),
  );
  assert.match(triggerFunction, /pg_catalog\.hashtextextended\(old\.id::text, 0\)/);
  assert.ok(
    triggerFunction.indexOf("pg_catalog.pg_advisory_xact_lock") <
      triggerFunction.indexOf("private.apple_sign_in_revocation_tokens"),
  );
  assert.match(
    appleDeletionRaceMigration,
    /revoke all on function public\.store_apple_sign_in_refresh_token\(uuid, text\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    appleDeletionRaceMigration,
    /grant execute on function public\.store_apple_sign_in_refresh_token\(uuid, text\)[\s\S]*to service_role/,
  );
});

test("개인 Auth 정리 job은 private durable table과 service-role 전용 RPC를 사용한다", () => {
  assert.match(
    migration,
    /create table if not exists private\.caregiver_account_deletion_jobs/,
  );
  assert.match(
    migration,
    /alter table private\.caregiver_account_deletion_jobs enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table private\.caregiver_account_deletion_jobs from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /create or replace function public\.claim_due_caregiver_account_deletion_jobs\(\s*p_limit integer default 1/,
  );
  assert.match(migration, /from private\.caregiver_account_deletion_jobs job[\s\S]*for update skip locked/);
  assert.match(migration, /job\.processing_started_at < now\(\) - interval '15 minutes'/);
  assert.match(
    migration,
    /revoke all on function public\.claim_due_caregiver_account_deletion_jobs\(integer\) from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.claim_due_caregiver_account_deletion_jobs\(integer\) to service_role/,
  );
});

test("개인 탈퇴 job이 생긴 Auth 사용자는 caregiver로 다시 연결할 수 없다", () => {
  assert.match(
    migration,
    /create or replace function private\.reject_account_deletion_caregiver_relink\(\)/,
  );
  assert.match(
    migration,
    /from private\.caregiver_account_deletion_jobs job\s+where job\.auth_user_id = new\.auth_user_id/,
  );
  assert.match(
    migration,
    /before insert or update of auth_user_id on public\.caregivers/,
  );
  assert.match(migration, /Account deletion prevents caregiver relinking/);
  assert.match(
    migration,
    /revoke all on function private\.reject_account_deletion_caregiver_relink\(\)[\s\S]*from public, anon, authenticated/,
  );
});

test("개인·가족 삭제 큐는 가장 오래된 due job을 골라 한쪽 큐의 기아를 막는다", () => {
  const selector = sqlFunction(
    "next_due_deletion_job_kind",
    "claim_due_caregiver_account_deletion_jobs",
  );
  const claimNext = worker.slice(
    worker.indexOf("async function claimNextDeletion"),
    worker.indexOf("serve(async"),
  );

  assert.match(selector, /from private\.caregiver_account_deletion_jobs job/);
  assert.match(selector, /from private\.family_deletion_jobs job/);
  assert.match(selector, /order by\s+queue\.due_at asc/);
  assert.match(selector, /queue\.job_kind = 'family'/);
  assert.match(
    migration,
    /grant execute on function public\.next_due_deletion_job_kind\(\) to service_role/,
  );
  assert.match(claimNext, /next_due_deletion_job_kind/);
  assert.match(claimNext, /\["family", "caregiver"\]/);
  assert.match(claimNext, /\["caregiver", "family"\]/);
  assert.match(claimNext, /return \[\];/);
});

test("개인 Auth 정리 실패와 완료는 claim token, bounded backoff, soft-delete tombstone으로 판정한다", () => {
  const failFunction = sqlFunction(
    "fail_caregiver_account_deletion_job",
    "finalize_caregiver_account_deletion_job",
  );
  const finalizeFunction = sourceSection(
    contentDeletionMigration,
    "create or replace function public.finalize_caregiver_account_deletion_job",
    "revoke all on function public.request_caregiver_account_deletion_v2_checked",
  );

  assert.match(failFunction, /job\.status = 'PROCESSING'/);
  assert.match(failFunction, /job\.claim_token = p_claim_token/);
  assert.match(
    failFunction,
    /where auth_user_id = p_auth_user_id\s+and status = 'PROCESSING'\s+and claim_token = p_claim_token/,
  );
  assert.match(failFunction, /interval '5 minutes'/);
  assert.match(failFunction, /interval '15 minutes'/);
  assert.match(failFunction, /interval '1 hour'/);
  assert.match(failFunction, /else interval '6 hours'/);
  assert.match(finalizeFunction, /v_job\.claim_token is distinct from p_claim_token/);
  assert.match(finalizeFunction, /from auth\.users user_row/);
  assert.match(finalizeFunction, /user_row\.deleted_at is not null/);
  assert.match(finalizeFunction, /from private\.caregiver_account_deletion_media_paths queued/);
  assert.match(finalizeFunction, /'auth_cleanup', 'completed_soft_delete'/);
  assert.match(finalizeFunction, /'storage_cleanup', 'completed'/);
  assert.match(finalizeFunction, /set status = 'COMPLETED',\s+family_id = null,\s+caregiver_id = null,/);
  assert.match(contentDeletionMigration, /alter column family_id drop not null/);
  assert.match(finalizeFunction, /set family_id = null,[\s\S]*caregiver_id = null,[\s\S]*auth_user_id = null/);
  assert.doesNotMatch(finalizeFunction, /delete\s+from\s+auth\.users/i);
});

test("구버전 탈퇴 안내와 신버전 작성 콘텐츠 삭제 정책은 RPC 버전으로 분리한다", () => {
  const legacyDeletionFunction = sourceSection(
    migration,
    "create or replace function public.request_caregiver_account_deletion_checked",
    "create or replace function public.schedule_family_deletion_checked",
  );
  const legacyPolicyGuard = legacyDeletionFunction.slice(
    legacyDeletionFunction.indexOf("from public.caregiver_legal_consents consent"),
    legacyDeletionFunction.indexOf("Updated account deletion policy requires version 2"),
  );

  assert.match(
    migration,
    /create or replace function public\.request_caregiver_account_deletion_checked\(\)/,
  );
  assert.match(
    contentDeletionMigration,
    /create or replace function public\.request_caregiver_account_deletion_v2_checked\(\)/,
  );
  assert.doesNotMatch(
    contentDeletionMigration,
    /create or replace function public\.request_caregiver_account_deletion_checked\(\)/,
  );
  assert.match(
    contentDeletionMigration,
    /grant execute on function public\.request_caregiver_account_deletion_v2_checked\(\)[\s\S]*to authenticated/,
  );
  assert.match(
    apiSource,
    /supabase\.rpc\("request_caregiver_account_deletion_v2_checked"\)/,
  );
  assert.match(
    migration,
    /caregiver_legal_consents consent[\s\S]*consent\.document_version = '2026-09-02'[\s\S]*Updated account deletion policy requires version 2/,
  );
  assert.doesNotMatch(legacyPolicyGuard, /consent\.auth_user_id/);
  assert.match(
    contentDeletionMigration,
    /metadata = coalesce\(audit\.metadata, '\{\}'::jsonb\)\s+\|\| jsonb_build_object/,
  );
});

test("가족 삭제 취소는 기한 전 최초 PENDING job만 family-to-job 잠금 순서로 허용한다", () => {
  const cancelFunction = migrationSection(
    "create or replace function public.cancel_family_deletion_checked",
    "-- Preserve deletion requests created before this durable queue existed.",
  );

  assert.ok(
    cancelFunction.indexOf("from public.families family") <
      cancelFunction.indexOf("from private.family_deletion_jobs job"),
    "cancel must lock family before job",
  );
  assert.ok(
    cancelFunction.indexOf("from public.families family") <
      cancelFunction.indexOf("for update"),
    "cancel must not hold a caregiver row while waiting for the family lock",
  );
  assert.match(cancelFunction, /select job\.status, job\.attempt_count/);
  assert.match(cancelFunction, /v_family\.deletion_scheduled_for <= clock_timestamp\(\)/);
  assert.match(cancelFunction, /v_job_status is distinct from 'PENDING'/);
  assert.match(cancelFunction, /v_job_attempt_count is distinct from 0/);
  assert.match(
    cancelFunction,
    /where family_id = v_family\.id\s+and status = 'PENDING'\s+and attempt_count = 0/,
  );
  assert.match(
    cancelFunction,
    /가족 삭제 정리가 시작되었거나 취소 기한이 지나 취소할 수 없습니다\./,
  );
});

test("가족 삭제 예약은 durable job으로 저장되고 기존 예약도 backfill한다", () => {
  assert.match(migration, /create table if not exists private\.family_deletion_jobs/);
  assert.match(migration, /alter table private\.family_deletion_jobs enable row level security/);
  assert.match(
    migration,
    /revoke all on table private\.family_deletion_jobs from public, anon, authenticated/,
  );
  assert.match(migration, /on conflict \(family_id\) do update/);
  assert.match(
    migration,
    /where family\.deletion_scheduled_for is not null\s+on conflict \(family_id\) do nothing/,
  );
  assert.match(migration, /set status = 'CANCELLED'/);
  assert.match(
    migration,
    /create or replace function public\.claim_due_family_deletion_jobs\(p_limit integer default 1\)/,
  );
});

test("가족 삭제 job claim과 실패 처리는 lease, claim token, bounded backoff를 사용한다", () => {
  const failFunction = sqlFunction(
    "fail_family_deletion_job",
    "finalize_family_deletion_job",
  );

  assert.match(migration, /for update of job skip locked/);
  assert.match(migration, /now\(\) - interval '15 minutes'/);
  assert.match(migration, /claim_token = gen_random_uuid\(\)/);
  assert.match(failFunction, /job\.claim_token = p_claim_token/);
  assert.match(
    failFunction,
    /where family_id = p_family_id\s+and status = 'PROCESSING'\s+and claim_token = p_claim_token/,
  );
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(migration, /interval '1 hour'/);
  assert.match(migration, /else interval '6 hours'/);
  assert.match(
    migration,
    /grant execute on function public\.claim_due_family_deletion_jobs\(integer\) to service_role/,
  );
});

test("finalize는 Storage가 빈 뒤에만 가족을 삭제하고 PII를 audit metadata에 넣지 않는다", () => {
  const functionSql = sqlFunction(
    "finalize_family_deletion_job",
    "family_media_upload_allowed",
  );

  assert.match(functionSql, /from storage\.objects object/);
  assert.ok(
    functionSql.indexOf("from public.families family") <
      functionSql.indexOf("from private.family_deletion_jobs job"),
    "finalize must lock the family row before the durable job row",
  );
  assert.match(functionSql, /v_job\.claim_token is distinct from p_claim_token/);
  assert.match(functionSql, /'photos\/' \|\| p_family_id::text \|\| '\/%'/);
  assert.match(functionSql, /'chat\/' \|\| p_family_id::text \|\| '\/%'/);
  assert.match(functionSql, /raise exception 'Family media storage cleanup is incomplete'/);
  assert.match(functionSql, /delete from public\.families/);
  const auditInsert = functionSql.slice(
    functionSql.indexOf("insert into public.account_deletion_audit("),
    functionSql.indexOf("delete from public.families"),
  );
  assert.doesNotMatch(auditInsert, /caregiver_id|auth_user_id|family_name/);
  assert.doesNotMatch(functionSql, /family_name|v_family\.name/);
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i);
});

test("기존 SQL purge를 비활성화하고 모든 Edge 호출을 환경별 Vault URL로 재등록한다", () => {
  const purgeFunction = migration.slice(
    migration.indexOf("create or replace function public.purge_due_family_deletions"),
    migration.indexOf("revoke all on function public.request_caregiver_account_deletion_checked"),
  );
  const dispatchFunction = migrationSection(
    "create or replace function private.dispatch_family_chat_push",
    "revoke all on function private.dispatch_family_chat_push",
  );

  assert.match(purgeFunction, /Direct family deletion purge is disabled/);
  assert.doesNotMatch(purgeFunction, /storage\.objects/);
  assert.doesNotMatch(migration, /sflxzfxoyicpiykvgcte/);
  assert.match(migration, /babyboss_edge_function_base_url/);
  assert.match(migration, /canonical HTTPS URL for this Supabase project/);
  assert.ok(
    migration.indexOf("babyboss_edge_function_base_url") <
      migration.indexOf("create table if not exists private.family_deletion_jobs"),
    "the project-local URL must fail fast before deletion queue DDL",
  );
  assert.match(migration, /'ilog-purge-family-deletions'/);
  assert.match(migration, /'babyboss-send-push-notifications'/);
  assert.match(migration, /'ilog-revoke-apple-sign-in-tokens'/);
  assert.match(migration, /'ilog-process-account-deletions'/);
  assert.match(migration, /cron\.unschedule\(v_job_id\)/);
  assert.match(migration, /\/functions\/v1\/send-push-notifications/);
  assert.match(migration, /\/functions\/v1\/revoke-apple-tokens/);
  assert.match(migration, /\/functions\/v1\/process-account-deletions/);
  assert.match(migration, /body := '\{\}'::jsonb,[\s\S]*timeout_milliseconds := 10000/);
  assert.match(migration, /body := jsonb_build_object\('limit', 10\),[\s\S]*timeout_milliseconds := 60000/);
  assert.match(migration, /body := jsonb_build_object\('limit', 1\)/);
  assert.match(dispatchFunction, /v_function_base_url \|\| '\/functions\/v1\/send-push-notifications'/);
  assert.match(dispatchFunction, /'familyId', new\.family_id/);
  assert.match(dispatchFunction, /'FAMILY_CHAT', 'FAMILY_CHAT_MENTION'/);
  assert.match(dispatchFunction, /timeout_milliseconds := 10000/);
  assert.match(migration, /babyboss_push_worker_cron_secret/);
  assert.match(
    migration,
    /revoke all on function public\.purge_due_family_deletions\(integer\)[\s\S]*service_role/,
  );
});

test("due 또는 processing 가족의 새 Storage 업로드를 현재 가족 범위에서만 허용한다", () => {
  const uploadAllowedFunction = sqlFunction(
    "family_media_upload_allowed",
    "purge_due_family_deletions",
  );

  assert.match(uploadAllowedFunction, /language plpgsql\s+volatile/);
  assert.match(uploadAllowedFunction, /v_family\.deletion_scheduled_for <= now\(\)/);
  assert.match(uploadAllowedFunction, /job\.status = 'PROCESSING'/);
  assert.match(
    uploadAllowedFunction,
    /p_family_id is distinct from v_current_family_id/,
  );
  assert.match(
    uploadAllowedFunction,
    /select \(public\.current_caregiver\(\)\)\.family_id\s+into v_current_family_id/,
  );
  assert.match(uploadAllowedFunction, /where family\.id = v_current_family_id\s+for key share/);
  assert.ok(
    uploadAllowedFunction.indexOf("for key share") <
      uploadAllowedFunction.indexOf("job.status = 'PROCESSING'"),
    "upload permission must lock the family before checking the worker lease",
  );
  assert.doesNotMatch(uploadAllowedFunction, /where family\.id = p_family_id/);
  assert.match(
    migration,
    /and public\.family_media_upload_allowed\(\(public\.current_caregiver\(\)\)\.family_id\)/,
  );
  assert.ok(migration.includes("and name ~ ("));
  assert.ok(migration.includes("'^(photos|chat)/'"));
  assert.ok(migration.includes("'/[A-Za-z0-9._-]+$'"));
  assert.match(
    restoredStoragePolicies,
    /and public\.family_media_upload_allowed\(\(public\.current_caregiver\(\)\)\.family_id\)/,
  );
  assert.match(restoredStoragePolicies, /and name ~ \(/);
});

test("삭제 worker의 media 목록은 claim token으로 제한된 SQL page를 사용해 중첩 경로도 진척시킨다", () => {
  const listFunction = sqlFunction(
    "list_family_deletion_media_paths",
    "purge_due_family_deletions",
  );

  assert.match(listFunction, /from storage\.objects object/);
  assert.match(listFunction, /object\.name like 'photos\/' \|\| p_family_id::text \|\| '\/%'/);
  assert.match(listFunction, /object\.name like 'chat\/' \|\| p_family_id::text \|\| '\/%'/);
  assert.match(listFunction, /job\.status = 'PROCESSING'/);
  assert.match(listFunction, /job\.claim_token = p_claim_token/);
  assert.match(listFunction, /limit least\(greatest\(coalesce\(p_limit, 1\), 1\), 500\)/);
  assert.match(
    migration,
    /revoke all on function public\.list_family_deletion_media_paths\(bigint, uuid, integer\) from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.list_family_deletion_media_paths\(bigint, uuid, integer\) to service_role/,
  );
  assert.doesNotMatch(listFunction, /delete\s+from\s+storage\.objects/i);
  assert.match(worker, /"list_family_deletion_media_paths"/);
  assert.match(worker, /p_claim_token: claimToken/);
  assert.doesNotMatch(worker, /\.list\(/);
});

test("Edge worker는 soft-delete 재시도와 bounded Storage cleanup을 45초 안에서 처리한다", () => {
  const caregiverProcessor = worker.slice(
    worker.indexOf("async function processCaregiverClaim"),
    worker.indexOf("async function processFamilyClaim"),
  );

  assert.match(worker, /defaultClaimLimit = 1/);
  assert.match(worker, /maxClaimsPerInvocation = 1/);
  assert.match(worker, /workerDeadlineMs = 45_000/);
  assert.match(worker, /maxPathsPerCleanupPass = 500/);
  assert.match(worker, /list_family_deletion_media_paths/);
  assert.match(worker, /removeBatchSize = 500/);
  assert.match(worker, /storage\.remove\(batch\)/);
  assert.match(worker, /maxCleanupPasses = 3/);
  assert.match(caregiverProcessor, /auth\.admin\.deleteUser\(\s*claim\.auth_user_id,\s*true/);
  assert.match(caregiverProcessor, /cleanupCaregiverMedia/);
  assert.match(caregiverProcessor, /finalize_caregiver_account_deletion_job/);
  assert.ok(
    caregiverProcessor.indexOf("cleanupCaregiverMedia") <
      caregiverProcessor.indexOf("deleteUser"),
    "caregiver Storage cleanup must finish before Auth soft deletion",
  );
  assert.ok(
    caregiverProcessor.indexOf("deleteUser") <
      caregiverProcessor.indexOf("finalize_caregiver_account_deletion_job"),
    "the tombstone finalize check must run even after a repeated soft-delete error",
  );
  assert.match(worker, /fail_caregiver_account_deletion_job/);
  assert.match(worker, /list_caregiver_account_deletion_media_paths/);
  assert.match(worker, /ack_caregiver_account_deletion_media_paths/);
  assert.match(worker, /caregiver_storage_remove_unconfirmed/);
  assert.match(worker, /finalize_family_deletion_job/);
  assert.match(worker, /fail_family_deletion_job/);
  assert.match(worker, /failed > 0 \? 503 : 200/);
  assert.match(worker, /PROCESSING lease[\s\S]*reclaim it after 15 minutes/);
  assert.match(worker, /PUSH_WORKER_CRON_SECRET/);
  assert.match(worker, /x-account-deletion-worker-secret/);
  assert.doesNotMatch(worker, /console\.(?:log|info|warn|error)/);
  assert.match(
    supabaseConfig,
    /\[functions\.process-account-deletions\]\s+verify_jwt = false/,
  );
});

test("배포 문서는 프로젝트별 Vault URL과 soft-delete tombstone 경계를 명시한다", () => {
  for (const document of [deployment, environmentMatrix]) {
    assert.match(document, /babyboss_edge_function_base_url/);
    assert.match(document, /https:\/\/<project-ref>\.supabase\.co/);
    assert.match(document, /검증 프로젝트에 운영 URL/);
    assert.match(document, /tombstone/);
    assert.match(document, /private job/);
    assert.match(document, /Storage ownership/);
    assert.match(document, /identity/);
    assert.doesNotMatch(document, /원시 (?:Auth )?UUID는[^\n]*private job[^\n]*에만/);
  }

  assert.match(deployment, /edge_function_base_url_matches_target/);
  assert.match(deployment, /db push 전 반드시 true/);
  assert.match(deployment, /attempt_count = 0/);
});
