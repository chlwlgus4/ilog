import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  performLogoutWithPushCleanup,
  retryLogoutNotificationCleanup,
} from "../src/features/auth/logoutPrivacyPolicy";

const mobileRoot = join(import.meta.dirname, "..");
const repositoryRoot = join(mobileRoot, "..");
const migration = readFileSync(
  join(repositoryRoot, "supabase", "migrations", "20260902101140_remove_push_device_on_logout.sql"),
  "utf8",
);
const hardeningMigration = readFileSync(
  join(repositoryRoot, "supabase", "migrations", "20260902101141_harden_push_logout_cleanup.sql"),
  "utf8",
);
const pushNotifications = readFileSync(
  join(mobileRoot, "src", "serverless", "pushNotifications.ts"),
  "utf8",
);
const supabaseApi = readFileSync(
  join(mobileRoot, "src", "serverless", "babyBossSupabaseApi.ts"),
  "utf8",
);

test("푸시 정리를 완료한 뒤 로그아웃한다", async () => {
  const calls: string[] = [];

  await performLogoutWithPushCleanup({
    cleanupPush: async () => {
      calls.push("cleanup");
    },
    signOut: async () => {
      calls.push("sign-out");
    },
  });

  assert.deepEqual(calls, ["cleanup", "sign-out"]);
});

test("푸시 정리가 실패해도 로컬 로그아웃을 막지 않는다", async () => {
  let signedOut = false;

  await performLogoutWithPushCleanup({
    cleanupPush: async () => {
      throw new Error("offline");
    },
    signOut: async () => {
      signedOut = true;
    },
  });

  assert.equal(signedOut, true);
});

test("로그아웃 요청이 실패해도 푸시 lifecycle 종료 처리를 실행한다", async () => {
  let finished = false;

  await assert.rejects(
    performLogoutWithPushCleanup({
      cleanupPush: async () => undefined,
      signOut: async () => {
        throw new Error("offline");
      },
      finishPushCleanup: () => {
        finished = true;
      },
    }),
    /offline/,
  );

  assert.equal(finished, true);
});

test("동시에 들어온 로그아웃은 푸시 정리와 sign-out 전체를 한 번만 실행한다", async () => {
  let cleanupCalls = 0;
  let signOutCalls = 0;
  let finishCalls = 0;
  let releaseCleanup!: () => void;
  const cleanupGate = new Promise<void>((resolve) => {
    releaseCleanup = resolve;
  });
  const options = {
    cleanupPush: async () => {
      cleanupCalls += 1;
      await cleanupGate;
    },
    signOut: async () => {
      signOutCalls += 1;
    },
    finishPushCleanup: () => {
      finishCalls += 1;
    },
  };

  const first = performLogoutWithPushCleanup(options);
  const second = performLogoutWithPushCleanup(options);
  assert.equal(first, second);
  assert.equal(cleanupCalls, 1);

  releaseCleanup();
  await Promise.all([first, second]);
  assert.equal(signOutCalls, 1);
  assert.equal(finishCalls, 1);
});

test("로그아웃 로컬 알림 정리는 실패 단계를 한 번 재시도한다", async () => {
  let attempts = 0;
  const cleaned = await retryLogoutNotificationCleanup({
    cleanupSteps: [
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary native failure");
        }
      },
    ],
  });

  assert.equal(cleaned, true);
  assert.equal(attempts, 2);
});

test("로그아웃 로컬 알림 정리는 반복 실패를 성공으로 오인하지 않는다", async () => {
  const cleaned = await retryLogoutNotificationCleanup({
    cleanupSteps: [async () => Promise.reject(new Error("native failure"))],
  });

  assert.equal(cleaned, false);
});

test("로그아웃 푸시 정리는 권한 요청 없이 서버와 네이티브 등록을 모두 해제한다", () => {
  const cleanupStart = pushNotifications.indexOf("export async function removePushRegistrationForLogout");
  const cleanupSource = pushNotifications.slice(cleanupStart);

  assert.ok(cleanupStart >= 0);
  assert.match(cleanupSource, /blockForLogoutAndWait/);
  assert.match(cleanupSource, /remove_current_push_device_token_checked/);
  assert.match(cleanupSource, /p_expo_push_token: registeredExpoPushToken/);
  assert.match(cleanupSource, /try \{[\s\S]*stablePushDeviceId[\s\S]*\} catch \{/);
  assert.match(cleanupSource, /unregisterForNotificationsAsync/);
  assert.match(cleanupSource, /cancelAllScheduledNotificationsAsync/);
  assert.match(cleanupSource, /dismissAllNotificationsAsync/);
  assert.match(cleanupSource, /!localCleanupSucceeded/);
  assert.match(cleanupSource, /if \(serverCleanupSucceeded\)[\s\S]*authStorage\.removeItem/);
  assert.doesNotMatch(cleanupSource, /requestPermissionsAsync/);
});

test("푸시 등록은 로그아웃 세대를 확인하고 진행 중 등록 뒤에만 정리를 시작한다", () => {
  const registrationStart = pushNotifications.indexOf(
    "async function performPushDeviceRegistration",
  );
  const cleanupStart = pushNotifications.indexOf(
    "export async function removePushRegistrationForLogout",
  );
  const registrationSource = pushNotifications.slice(registrationStart, cleanupStart);

  assert.ok(registrationStart >= 0 && cleanupStart > registrationStart);
  assert.match(registrationSource, /isRegistrationCurrent\(registrationGeneration\)/);
  assert.match(registrationSource, /supabase\.auth\.getSession\(\)/);
  assert.match(registrationSource, /latestExpoPushToken = tokenPayload\.data/);
  assert.match(pushNotifications, /pushRegistrationLifecycle\.track/);
  assert.match(pushNotifications, /resumePushRegistrationForAuthenticatedSession/);
  assert.match(pushNotifications, /completePushRegistrationLogout/);
});

test("일반 로그아웃과 비밀번호 재설정 종료는 공통 푸시 정리를 거친다", () => {
  const passwordResetStart = supabaseApi.indexOf("export async function updateRecoveredPassword");
  const restoreStart = supabaseApi.indexOf("export async function restoreSession", passwordResetStart);
  const logoutStart = supabaseApi.indexOf("export async function logout");
  const consentStart = supabaseApi.indexOf("export async function hasCurrentLegalConsent", logoutStart);

  assert.match(
    supabaseApi.slice(passwordResetStart, restoreStart),
    /performLogoutWithPushCleanup\([\s\S]*removePushRegistrationForLogout/,
  );
  assert.match(
    supabaseApi.slice(logoutStart, consentStart),
    /performLogoutWithPushCleanup\([\s\S]*removePushRegistrationForLogout/,
  );
});

test("로그아웃 RPC는 현재 보호자의 현재 기기만 지우고 테이블 직접 권한을 닫는다", () => {
  assert.match(migration, /where caregiver\.auth_user_id = auth\.uid\(\)/);
  assert.match(migration, /token\.caregiver_id = v_current_caregiver_id/);
  assert.match(migration, /token\.platform = v_platform/);
  assert.match(migration, /if v_device_id is null and v_expo_push_token is null then/);
  assert.match(migration, /v_device_id is not null and token\.device_id = v_device_id/);
  assert.match(migration, /token\.expo_push_token = v_expo_push_token/);
  assert.doesNotMatch(migration, /device_id is not distinct from v_device_id/);
  assert.match(
    migration,
    /revoke all privileges on table public\.push_device_tokens from authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.remove_current_push_device_token_checked\(text, text, text\)[\s\S]*to authenticated/,
  );
});

test("기존 2인자 로그아웃 RPC overload를 제거하고 3인자 함수만 허용한다", () => {
  assert.match(
    hardeningMigration,
    /drop function if exists public\.remove_current_push_device_token_checked\(text, text\)/,
  );
  assert.match(
    hardeningMigration,
    /grant execute on function public\.remove_current_push_device_token_checked\(text, text, text\)[\s\S]*to authenticated/,
  );
});
