import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isProtectedPath, resolveSessionRecoveryPolicy } from "../src/navigation/sessionRoutePolicy";
import {
  isAccessTokenSessionError,
  isTerminalSessionError,
  loadWithAccessTokenRecovery,
} from "../src/serverless/sessionErrorPolicy";

const mobileRoot = join(import.meta.dirname, "..");
const runtime = readFileSync(join(mobileRoot, "src", "hooks", "useBabyBossRuntime.ts"), "utf8");
const rootLayout = readFileSync(join(mobileRoot, "app", "_layout.tsx"), "utf8");

test("없거나 만료된 인증 상태만 종료된 세션으로 분류한다", () => {
  assert.equal(isTerminalSessionError(new Error("저장된 로그인 세션이 없어요. 다시 로그인해 주세요.")), true);
  assert.equal(isTerminalSessionError(new Error("현재 보호자 정보를 찾지 못했어요.")), true);
  assert.equal(isTerminalSessionError(new Error("Invalid Refresh Token: Refresh Token Not Found")), true);
  assert.equal(isTerminalSessionError(new Error("JWT has expired")), false);
  assert.equal(isAccessTokenSessionError(new Error("JWT has expired")), true);
  assert.equal(isAccessTokenSessionError(new Error("invalid JWT")), true);
});

test("네트워크와 일시적인 서버 오류는 로그인 상태를 보존한다", () => {
  assert.equal(isTerminalSessionError(new Error("Network request failed")), false);
  assert.equal(isTerminalSessionError(new Error("The request timed out")), false);
  assert.equal(isTerminalSessionError(new Error("503 Service Unavailable")), false);
  assert.equal(isTerminalSessionError(new Error("초기 정보를 불러오지 못했어요.")), false);
});

test("만료된 access token은 한 번 갱신하고 새 세션으로 다시 조회한다", async () => {
  const loadedSessions: string[] = [];
  let refreshCount = 0;

  const result = await loadWithAccessTokenRecovery({
    session: "expired",
    load: async (session) => {
      loadedSessions.push(session);
      if (session === "expired") {
        throw new Error("JWT has expired");
      }
      return "복원 완료";
    },
    refresh: async () => {
      refreshCount += 1;
      return "refreshed";
    },
  });

  assert.equal(result, "복원 완료");
  assert.equal(refreshCount, 1);
  assert.deepEqual(loadedSessions, ["expired", "refreshed"]);
});

test("네트워크 오류에는 access token 갱신을 시도하지 않는다", async () => {
  let refreshCount = 0;

  await assert.rejects(() => loadWithAccessTokenRecovery({
    session: "current",
    load: async () => {
      throw new Error("Network request failed");
    },
    refresh: async () => {
      refreshCount += 1;
      return "unused";
    },
  }), /Network request failed/);

  assert.equal(refreshCount, 0);
});

test("복원 가능한 오류는 로그인 이동 대신 재시도 화면을 제공한다", () => {
  assert.match(runtime, /setSessionRecoveryRequired\(true\)/);
  assert.match(runtime, /retrySessionRestore: initialize/);
  assert.match(rootLayout, /testID="session-recovery"/);
  assert.match(rootLayout, /testID="session-recovery-retry"/);
});

test("신고·차단 관리 화면은 로그인한 사용자만 접근한다", () => {
  assert.equal(isProtectedPath("/safety"), true);
});

test("부분 세션이어도 보호 경로에서는 복구하고 공개 경로는 가리지 않는다", () => {
  assert.deepEqual(resolveSessionRecoveryPolicy({
    pathname: "/home",
    isBooting: false,
    sessionRecoveryRequired: true,
  }), {
    showRecovery: true,
    allowSessionRedirects: false,
  });

  for (const pathname of ["/terms", "/privacy-policy", "/support", "/delete-account", "/login"]) {
    assert.equal(isProtectedPath(pathname), false);
    assert.deepEqual(resolveSessionRecoveryPolicy({
      pathname,
      isBooting: false,
      sessionRecoveryRequired: true,
    }), {
      showRecovery: false,
      allowSessionRedirects: false,
    });
  }

  assert.equal(isProtectedPath("/privacy"), true);
});

test("부팅 중에는 복구 화면과 세션 리다이렉트를 모두 보류한다", () => {
  assert.deepEqual(resolveSessionRecoveryPolicy({
    pathname: "/home",
    isBooting: true,
    sessionRecoveryRequired: true,
  }), {
    showRecovery: false,
    allowSessionRedirects: false,
  });
});

test("인증 성공은 데이터 hydration이 끝난 뒤에만 복구 상태를 해제한다", () => {
  const hydrateStart = runtime.indexOf("async function hydrate(");
  const hydrateEnd = runtime.indexOf("async function refreshDashboard", hydrateStart);
  const hydrateSource = runtime.slice(hydrateStart, hydrateEnd);
  const firstPayloadFetch = hydrateSource.indexOf("const [settingsPayload, previewPayload] = await Promise.all");
  const fullPayloadFetch = hydrateSource.indexOf("const [dashboardPayload, chatPayload");
  const recoveryClears = [...hydrateSource.matchAll(/setSessionRecoveryRequired\(false\)/g)]
    .map((match) => match.index ?? -1);

  assert.equal(recoveryClears.length, 3);
  assert.ok(recoveryClears[1] > firstPayloadFetch);
  assert.ok(recoveryClears[2] > fullPayloadFetch);
});

test("로그인 성공 뒤 아이 프로필 온보딩은 세션 진입 경로에서도 유지한다", () => {
  assert.match(rootLayout, /const shouldRequireChildProfile = !app\.isBooting && !app\.sessionRecoveryRequired && hasSession && !hasChild/);
  assert.doesNotMatch(rootLayout, /shouldRequireChildProfile =[^;]*isGuardedPath/);
});

test("세션을 먼저 저장한 뒤 데이터 hydration이 실패하면 즉시 복구 모드로 전환한다", () => {
  const hydrateStart = runtime.indexOf("async function hydrate(");
  const hydrateEnd = runtime.indexOf("async function refreshDashboard", hydrateStart);
  const hydrateSource = runtime.slice(hydrateStart, hydrateEnd);
  const sessionCommit = hydrateSource.indexOf("setSession(nextSession)");
  const recoveryCatch = hydrateSource.indexOf("catch (hydrateError)");
  const recoveryRequired = hydrateSource.indexOf("setSessionRecoveryRequired(true)", recoveryCatch);

  assert.ok(sessionCommit >= 0);
  assert.ok(recoveryCatch > sessionCommit);
  assert.ok(recoveryRequired > recoveryCatch);
  assert.match(hydrateSource.slice(recoveryCatch), /throw hydrateError/);
});
