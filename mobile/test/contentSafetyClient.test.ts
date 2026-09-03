import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as policy from "../src/features/safety/safetyPolicy";
import * as requestPolicy from "../src/features/safety/safetyRequestPolicy";

type SafetyApi = typeof import("../src/serverless/safetyApi");
type RpcResult = { data: unknown; error: unknown };
type Call = { name: string; args: unknown; resolve: (value: RpcResult) => void };
const source = readFileSync(join(import.meta.dirname, "..", "src/serverless/safetyApi.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const stateResult = (blocked: number[] = [], hidden: policy.HiddenSafetyTarget[] = []): RpcResult => ({ data: { blocked_caregiver_ids: blocked, hidden_targets: hidden }, error: null });

function harness() {
  let userId: string | null = "account-a";
  let authListener: ((_event: string, session: { user: { id: string } } | null) => void) | undefined;
  const calls: Call[] = [];
  const pending: Call[] = [];
  const client = {
    auth: {
      onAuthStateChange: (callback: typeof authListener) => { authListener = callback; },
      getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null }, error: null }),
    },
    rpc: (name: string, args: unknown) => new Promise<RpcResult>((resolve) => { const call = { name, args, resolve }; calls.push(call); pending.push(call); }),
  };
  const exports: Partial<SafetyApi> = {};
  // Execute the actual adapter, substituting only its native Supabase transport.
  runInNewContext(compiled, { exports, require: (name: string) => {
    if (name === "./supabase") return { getBabyBossSupabaseClient: () => client };
    if (name.endsWith("safetyPolicy")) return policy;
    if (name.endsWith("safetyRequestPolicy")) return requestPolicy;
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  const api = exports as SafetyApi;
  function reply(name: string, result: RpcResult) {
    const index = pending.findIndex((call) => call.name === name);
    assert.ok(index >= 0, `Missing RPC: ${name}`);
    pending.splice(index, 1)[0].resolve(result);
  }
  async function ready(blocked: number[] = []) {
    const request = api.refreshContentSafetyState();
    await setImmediate();
    reply("get_my_content_safety_state_checked", stateResult(blocked));
    await request;
  }
  return { api, calls, pending, reply, ready, setUser: (value: string | null) => { userId = value; authListener?.("SIGNED_IN", value ? { user: { id: value } } : null); } };
}

test("안전 상태 최초 조회 실패와 잘못된 응답은 빈 성공 목록으로 바꾸지 않는다", async () => {
  const h = harness();
  const request = h.api.refreshContentSafetyState();
  const rejection = assert.rejects(request, /설정을 확인하지 못했어요/);
  await setImmediate();
  assert.equal(h.api.getContentSafetySnapshot().status, "loading");
  h.reply("get_my_content_safety_state_checked", { data: {}, error: null });
  await rejection;
  assert.equal(h.api.getContentSafetySnapshot().status, "error");
});

test("변화 없는 background polling은 ready와 snapshot 참조를 유지하여 작성 중 모달을 보존한다", async () => {
  const h = harness();
  await h.ready([7]);
  const before = h.api.getContentSafetySnapshot();
  let notifications = 0;
  h.api.subscribeContentSafetyState(() => { notifications += 1; });
  const request = h.api.refreshContentSafetyState();
  await setImmediate();
  assert.equal(h.api.getContentSafetySnapshot(), before);
  h.reply("get_my_content_safety_state_checked", stateResult([7]));
  await request;
  assert.equal(h.api.getContentSafetySnapshot(), before);
  assert.equal(notifications, 0);
});

test("외부 차단/운영 숨김 변경은 개인정보 없는 이벤트를 한 번 전달한다", async () => {
  const h = harness();
  await h.ready();
  const changes: unknown[] = [];
  h.api.subscribeSafetyChanges((change) => changes.push(JSON.parse(JSON.stringify(change))));
  const request = h.api.refreshContentSafetyState();
  await setImmediate();
  h.reply("get_my_content_safety_state_checked", stateResult([7], [{ target_type: "RECORD_ATTACHMENT", target_id: 5 }]));
  await request;
  assert.deepEqual(changes, [{ kind: "server-refresh" }]);
  assert.equal(h.api.getContentSafetySnapshot().blockedCaregiverIds[0], 7);
});

test("계정 A의 느린 읽기는 계정 B의 성공 상태로 resolve하거나 덮어쓰지 않는다", async () => {
  const h = harness();
  await h.ready();
  const oldRead = h.api.refreshContentSafetyState();
  const oldRejected = assert.rejects(oldRead, /로그인 상태가 바뀌었어요/);
  await setImmediate();
  h.setUser("account-b");
  assert.equal(h.api.getContentSafetySnapshot().status, "idle");
  const newRead = h.api.refreshContentSafetyState();
  await setImmediate();
  h.reply("get_my_content_safety_state_checked", stateResult([99]));
  await oldRejected;
  h.reply("get_my_content_safety_state_checked", stateResult([7]));
  await newRead;
  assert.deepEqual([...h.api.getContentSafetySnapshot().blockedCaregiverIds], [7]);
});

test("초기 안전 조회를 기다리다 계정이 바뀌면 원래 화면의 차단 RPC를 보내지 않는다", async () => {
  const h = harness();
  const block = h.api.blockCaregiver(7);
  const rejected = assert.rejects(block, /로그인 상태가 바뀌었어요/);
  await setImmediate();
  h.setUser("account-b");
  h.reply("get_my_content_safety_state_checked", stateResult());
  await rejected;
  assert.equal(h.calls.filter((call) => call.name === "block_caregiver_checked").length, 0);
  assert.equal(h.api.getContentSafetySnapshot().status, "idle");
});

test("차단 성공보다 늦게 도착한 구 조회는 차단을 되돌리지 않는다", async () => {
  const h = harness();
  await h.ready();
  const block = h.api.blockCaregiver(7);
  await setImmediate();
  const oldRead = h.api.refreshContentSafetyState();
  const oldRejected = assert.rejects(oldRead, /설정이나 로그인 상태가 바뀌었어요/);
  await setImmediate();
  h.reply("block_caregiver_checked", { data: null, error: null });
  await block;
  assert.deepEqual([...h.api.getContentSafetySnapshot().blockedCaregiverIds], [7]);
  await setImmediate();
  h.reply("get_my_content_safety_state_checked", stateResult());
  await oldRejected;
  assert.deepEqual([...h.api.getContentSafetySnapshot().blockedCaregiverIds], [7]);
  h.reply("get_my_content_safety_state_checked", stateResult([7]));
  await setImmediate();
  assert.equal(h.api.getContentSafetySnapshot().status, "ready");
});

test("내 차단 해제 뒤 상대의 차단이 남아 있으면 ID를 낙관적으로 제거하지 않는다", async () => {
  const h = harness();
  await h.ready([7]);
  const unblock = h.api.unblockCaregiver(7);
  await setImmediate();
  h.reply("unblock_caregiver_checked", { data: null, error: null });
  await setImmediate();
  assert.deepEqual([...h.api.getContentSafetySnapshot().blockedCaregiverIds], [7]);
  h.reply("get_my_content_safety_state_checked", stateResult([7]));
  await unblock;
  assert.deepEqual([...h.api.getContentSafetySnapshot().blockedCaregiverIds], [7]);
});

test("계정 전환 뒤 도착한 차단 성공은 새 계정에 성공으로 반환하지 않는다", async () => {
  const h = harness();
  await h.ready();
  const block = h.api.blockCaregiver(7);
  const rejected = assert.rejects(block, /로그인 상태가 바뀌었어요/);
  await setImmediate();
  h.setUser("account-b");
  h.reply("block_caregiver_checked", { data: null, error: null });
  await rejected;
  assert.equal(h.api.getContentSafetySnapshot().status, "idle");
  assert.equal(h.api.getContentSafetySnapshot().blockedCaregiverIds.length, 0);
});

test("신고 RPC는 참조·사유·선택 설명만 전송하고 이름/본문/사진을 복제하지 않는다", async () => {
  const h = harness();
  await h.ready();
  const report = h.api.reportSafetyContent("FAMILY_PHOTO", 5, "PRIVACY", "  삭제 요청  ");
  await setImmediate();
  const call = h.calls.find((item) => item.name === "report_safety_content_checked");
  assert.deepEqual(JSON.parse(JSON.stringify(call?.args)), { p_target_type: "FAMILY_PHOTO", p_target_id: 5, p_reason: "PRIVACY", p_details: "삭제 요청" });
  h.reply("report_safety_content_checked", { data: { report_id: 3, status: "OPEN", already_reported: false }, error: null });
  await report;
  assert.equal(policy.isSafetyTargetHidden(h.api.getContentSafetySnapshot(), "FAMILY_PHOTO", 5), true);
  await setImmediate();
  h.reply("get_my_content_safety_state_checked", stateResult([], [{ target_type: "FAMILY_PHOTO", target_id: 5 }]));
  await setImmediate();
});

test("신고 설명 검증 및 차단된 댓글 작성자와 공동 기록 숨김은 별개다", () => {
  assert.match(policy.validateSafetyReport(null, "") ?? "", /선택/);
  assert.match(policy.validateSafetyReport("OTHER", "짧음") ?? "", /10자/);
  assert.match(policy.validateSafetyReport("PRIVACY", "가".repeat(1001)) ?? "", /1,000자/);
  assert.equal(policy.validateSafetyReport("HARASSMENT", ""), null);
  const state: policy.ContentSafetyData = { blockedCaregiverIds: [7], hiddenTargets: [] };
  assert.equal(policy.isCommunicationAuthorHidden(state, 7), true);
  assert.equal(policy.isSafetyTargetHidden(state, "LOG", 7), false);
  assert.deepEqual(policy.filterSafetyComments(state, [{ id: 1, authorId: 7, replies: [{ id: 2, authorId: 8, replies: [] }] }, { id: 3, authorId: 8, replies: [] }]).map((comment) => comment.id), [3]);
  assert.match(policy.contentSafetyErrorMessage({ message: "CONTENT_SAFETY_USER_RESTRICTED" }), /제한된 계정/);
  assert.match(policy.contentSafetyErrorMessage({ message: "Parent comment was not found" }), /접근할 수 없어요/);
});
