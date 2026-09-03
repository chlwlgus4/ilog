import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import test from "node:test";

const migration = readFileSync(new URL("../../supabase/migrations/20260902232214_family_content_safety_controls.sql", import.meta.url), "utf8");
const operations = readFileSync(new URL("../../supabase/migrations/20260902232320_release_operations_health.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../../supabase/functions/send-push-notifications/index.ts", import.meta.url), "utf8");
const fixture = readFileSync(new URL("../../supabase/tests/content_safety.sql", import.meta.url), "utf8");

function sqlFunction(name: string): string {
  const escaped = name.replaceAll(".", "\\.");
  const value = migration.match(new RegExp(`create (?:or replace )?function ${escaped}\\([\\s\\S]*?\\$\\$;`))?.[0];
  assert.ok(value, `${name} must exist`);
  return value;
}

test("신고와 차단 정보는 private RLS 테이블에 두고 가족·계정 삭제와 함께 정리한다", () => {
  for (const table of ["safety_reports", "caregiver_blocks", "reported_content_hides", "moderation_content_hides", "moderation_restrictions"]) {
    assert.match(migration, new RegExp(`create table private\\.${table} \\(`));
    assert.match(migration, new RegExp(`alter table private\\.${table} enable row level security`));
  }
  assert.match(migration, /private\.moderation_restrictions from public, anon, authenticated, service_role/);
  assert.match(migration, /reporter_caregiver_id bigint not null references public\.caregivers\(id\) on delete cascade/);
  assert.match(migration, /reported_caregiver_id bigint references public\.caregivers\(id\) on delete cascade/);
  assert.match(migration, /last_action text check/);
  assert.doesNotMatch(migration, /(?:content_snapshot|message_snapshot|photo_snapshot|raw_content)\s+(?:text|jsonb)/);
});

test("신고자는 서버가 결정하고 익명·다른 가족·자기 신고·입력과 동시 quota 우회를 차단한다", () => {
  const auth = sqlFunction("private.require_safety_caregiver");
  const report = sqlFunction("public.report_safety_content_checked");
  assert.match(auth, /auth\.users u where u\.id = auth\.uid\(\)/);
  assert.match(auth, /not coalesce\(u\.is_anonymous, false\) and u\.deleted_at is null/);
  assert.doesNotMatch(auth, /(?:raw_user_meta_data|user_metadata)/);
  assert.doesNotMatch(report, /p_reporter|p_caregiver_id|p_auth_user_id/);
  assert.match(report, /v_target\.family_id is distinct from v_current\.family_id/);
  assert.match(report, /v_target\.author_id = v_current\.id/);
  assert.match(report, /char_length\(coalesce\(v_details, ''\)\) > 1000/);
  assert.match(report, /p_reason = 'OTHER'.*< 10/);
  assert.match(report, /pg_advisory_xact_lock/);
  assert.match(report, /interval '1 hour'\) >= 5/);
  assert.match(report, /interval '24 hours'\) >= 20/);
  assert.ok(report.indexOf("'already_reported',true") < report.indexOf("CONTENT_SAFETY_RATE_LIMITED"));
});

test("차단은 양방향 통신에만 적용하고 신고·운영 숨김 상태도 캐시에 반영한다", () => {
  const blocked = sqlFunction("private.caregiver_contact_blocked");
  const state = sqlFunction("public.get_my_content_safety_state_checked");
  const visibility = sqlFunction("private.safety_visible_to");
  assert.match(blocked, /blocker_caregiver_id = p_first and b\.blocked_caregiver_id = p_second/);
  assert.match(blocked, /blocker_caregiver_id = p_second and b\.blocked_caregiver_id = p_first/);
  assert.match(visibility, /not p_contact or not private\.caregiver_contact_blocked/);
  assert.match(visibility, /coalesce\(p_author = p_viewer,\s*false\)/);
  assert.match(state, /union select b\.blocker_caregiver_id/);
  assert.match(state, /union select h\.target_type,h\.target_id from private\.moderation_content_hides/);
  assert.match(migration, /as restrictive for select to authenticated/);
  assert.match(migration, /\('tasks','TASK','created_by_id',false\)/);
  assert.match(migration, /\('record_attachments','RECORD_ATTACHMENT','created_by_id',false\)/);
});

test("기존 direct·RPC 쓰기는 같은 서버 필터와 제재 검사로 보호한다", () => {
  const filter = sqlFunction("private.assert_content_safety_text");
  const trigger = sqlFunction("private.enforce_content_safety_write");
  assert.match(filter, /normalize\(coalesce\(p_text,''\),NFKC\)/);
  assert.match(filter, /CONTENT_SAFETY_FILTERED/);
  assert.match(trigger, /perform private\.assert_content_safety_text\(v_text\)/);
  assert.match(trigger, /CONTENT_SAFETY_USER_RESTRICTED/);
  assert.match(trigger, /CAREGIVER_CONTACT_BLOCKED/);
  for (const field of ["image_url", "storage_path", "image_storage_path"]) assert.ok(trigger.includes(field));
  for (const table of ["family_chat_messages", "chat_messages", "timeline_comments", "family_photos", "logs", "growth_measurements", "vaccination_records", "hospital_visits", "memory_entries", "tasks", "schedules", "record_attachments"]) {
    assert.match(migration, new RegExp(`\\('${table}','[^']+','[^']+'\\)`));
  }
  assert.match(migration, /create trigger content_safety_write before insert or update/);
  assert.match(migration, /content_safety_media_update on storage\.objects as restrictive for update/);
});

test("운영 조치와 보고서 조회는 service role만 허용하고 처리 추적·보관기간을 유지한다", () => {
  const moderation = sqlFunction("public.moderate_safety_report_checked");
  const purge = sqlFunction("public.purge_resolved_safety_reports_checked");
  assert.match(moderation, /for update/);
  assert.match(moderation, /last_action=p_action/);
  assert.match(moderation, /'IN_REVIEW','DISMISS','HIDE_CONTENT','RESTORE_CONTENT','RESTRICT_USER','UNRESTRICT_USER'/);
  assert.match(migration, /'list_safety_reports_checked','moderate_safety_report_checked','purge_resolved_safety_reports_checked'[\s\S]*?grant execute on function %s to service_role/);
  assert.match(purge, /resolved_at is not null/);
  assert.match(purge, /interval '89 days 23 hours'/);
  assert.doesNotMatch(purge, /delete from private\.reported_content_hides/);
  assert.match(migration, /cron\.schedule\('purge-resolved-content-safety-reports','17 \* \* \* \*'/);
});

test("푸시는 큐 생성·claim·실제 전송 직전에 차단과 신고 상태를 재검사한다", () => {
  assert.match(sqlFunction("private.enforce_push_content_safety"), /private\.push_content_safety_allowed\(new\)/);
  assert.match(sqlFunction("public.claim_pending_push_notification_events"), /private\.push_content_safety_allowed\(e\)/);
  assert.match(sqlFunction("public.can_deliver_content_safety_push_checked"), /e\.status='PROCESSING' and private\.push_content_safety_allowed\(e\)/);
  const recheck = worker.indexOf('"can_deliver_content_safety_push_checked"');
  const delivery = worker.indexOf("await sendExpoPush(token, event, expoAccessToken)");
  assert.ok(recheck >= 0 && delivery > recheck);
  assert.match(worker.slice(recheck, delivery), /if \(safetyError\)/);
  assert.match(worker.slice(recheck, delivery), /mayDeliver !== true/);
});

test("운영 상태 API는 service role claim을 확인하고 개인정보 없는 카운트만 반환한다", () => {
  assert.match(operations, /is distinct from 'service_role'/);
  assert.match(operations, /OPERATIONS_SERVICE_ROLE_REQUIRED/);
  assert.match(operations, /from public, anon, authenticated/);
  for (const field of ["open_reports", "urgent_unreviewed_reports", "overdue_reports", "stale_deletions", "failed_deletions", "apple_manual_required", "stale_apple_revocations", "failed_push_events", "stale_push_events"]) {
    assert.ok(operations.includes(`'${field}'`));
  }
  assert.doesNotMatch(operations, /jsonb_build_object\([^;]*(?:'details'|'email'|'family_id'|'auth_user_id'|'last_error')/);
});

test("격리 통합 fixture는 데이터와 역할 경계를 검증한 후 반드시 rollback한다", () => {
  assert.match(fixture, /begin isolation level repeatable read;/);
  assert.match(fixture, /set local role anon/);
  assert.match(fixture, /set local role authenticated/);
  assert.match(fixture, /set local role service_role/);
  assert.match(fixture, /CONTENT_SAFETY_RATE_LIMITED/);
  assert.match(fixture, /can_deliver_content_safety_push_checked/);
  assert.match(fixture, /request_caregiver_account_deletion_v2_checked/);
  assert.match(fixture, /rollback;\s*select 'content safety integration checks passed'/);
});
