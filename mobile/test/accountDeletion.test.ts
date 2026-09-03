import type { CaregiverSummary, FamilySummary } from "../src/api";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  canLeaveFamily,
  formatFamilyDeletionDate,
  isFamilyDeletionOwner,
} from "../src/features/settings/accountDeletion";

const caregivers: CaregiverSummary[] = [
  { id: 1, email: "mom@example.com", name: "엄마", role: "MOM", availabilityScore: 0, fatigueScore: 0 },
  { id: 2, email: "dad@example.com", name: "아빠", role: "DAD", availabilityScore: 0, fatigueScore: 0 },
];

const family: FamilySummary = {
  id: 1,
  name: "우리 가족",
  inviteCode: "BB-TEST",
  ownerCaregiverId: 1,
  deletionScheduledFor: null,
};

const mobileRoot = join(import.meta.dirname, "..");
const repositoryRoot = join(mobileRoot, "..");
const apiContract = readFileSync(join(mobileRoot, "src", "api.ts"), "utf8");
const accountDeletionApi = readFileSync(join(mobileRoot, "src", "serverless", "babyBossSupabaseApi.ts"), "utf8");
const nativeAppleSignIn = readFileSync(join(mobileRoot, "src", "serverless", "nativeAppleSignIn.ts"), "utf8");
const supabaseClient = readFileSync(join(mobileRoot, "src", "serverless", "supabase.ts"), "utf8");
const babyBossActions = readFileSync(join(mobileRoot, "src", "hooks", "babyBossActions.ts"), "utf8");
const accountDeletionScreen = readFileSync(join(mobileRoot, "src", "screens", "BabyBossExtraScreens.tsx"), "utf8");
const appleTokenExchangeFunction = readFileSync(
  join(repositoryRoot, "supabase", "functions", "exchange-apple-token", "index.ts"),
  "utf8",
);
const appleTokenWorker = readFileSync(
  join(repositoryRoot, "supabase", "functions", "revoke-apple-tokens", "index.ts"),
  "utf8",
);
const appleSignInShared = readFileSync(
  join(repositoryRoot, "supabase", "functions", "_shared", "appleSignIn.ts"),
  "utf8",
);
const appleTokenMigration = readFileSync(
  join(repositoryRoot, "supabase", "migrations", "20260825122337_add_apple_token_revocation.sql"),
  "utf8",
);

test("개인 탈퇴는 다른 보호자가 남아 있을 때만 가능하다", () => {
  assert.equal(canLeaveFamily(caregivers), true);
  assert.equal(canLeaveFamily([caregivers[0]]), false);
});

test("가족 전체 삭제 예약과 취소는 대표 보호자만 가능하다", () => {
  assert.equal(isFamilyDeletionOwner(family, 1), true);
  assert.equal(isFamilyDeletionOwner(family, 2), false);
});

test("30일 삭제 기한은 한국어 화면 형식으로 표시한다", () => {
  assert.match(formatFamilyDeletionDate("2026-08-23T00:00:00.000Z") ?? "", /2026년/);
});

test("Apple 계정 삭제는 자동 해지와 수동 fallback 상태를 구분한다", () => {
  assert.match(apiContract, /"NOT_APPLICABLE" \| "AUTOMATIC" \| "MANUAL_REQUIRED"/);
  assert.match(accountDeletionApi, /appleAccessRevocationStatus: appleRevocationStatus\(authMethods\)/);
  assert.match(apiContract, /https:\/\/support\.apple\.com\/ko-kr\/102571/);
  assert.match(accountDeletionScreen, /appleAccessRevocationStatus === "AUTOMATIC"/);
  assert.match(accountDeletionScreen, /appleAccessRevocationStatus === "MANUAL_REQUIRED"[\s\S]*showAppleManualRevocationAction/);
  assert.match(accountDeletionScreen, /function showAppleManualRevocationAction[\s\S]*openAppleAccessRevocationGuide/);
});

test("Apple authorization code는 서버 교환을 위한 메모리 값으로만 보존한다", () => {
  assert.match(nativeAppleSignIn, /authorizationCode: credential\.authorizationCode/);
  assert.doesNotMatch(nativeAppleSignIn, /SecureStore|AsyncStorage|console\.(?:log|info|warn|error)/);
});

test("Apple code는 인증된 Edge Function에서 현재 Apple identity와 대조해 교환한다", () => {
  assert.match(accountDeletionApi, /functions\.invoke\("exchange-apple-token"/);
  assert.match(appleTokenExchangeFunction, /auth\.getUser\(\)/);
  assert.match(appleTokenExchangeFunction, /verifiedAppleSubjectFromIdToken/);
  assert.match(appleTokenExchangeFunction, /APPLE_ACCOUNT_MISMATCH/);
  assert.match(appleSignInShared, /jwtVerify\([\s\S]*issuer: appleAudience[\s\S]*audience: clientId/);
  assert.match(appleSignInShared, /appleTokenUrl = `\$\{appleAudience\}\/auth\/token`/);
  assert.doesNotMatch(appleTokenExchangeFunction, /console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(appleSignInShared, /console\.(?:log|info|warn|error)/);
});

test("Apple refresh token은 Vault outbox에 보관하고 Auth 삭제 뒤 자동 해지한다", () => {
  assert.match(appleTokenMigration, /private\.apple_sign_in_revocation_tokens/);
  assert.match(appleTokenMigration, /vault\.create_secret/);
  assert.match(appleTokenMigration, /before delete on auth\.users/);
  assert.match(appleTokenMigration, /MANUAL_REQUIRED/);
  assert.match(appleTokenMigration, /for update skip locked/);
  assert.match(appleTokenWorker, /revokeAppleRefreshToken/);
  assert.match(appleSignInShared, /appleRevokeUrl = `\$\{appleAudience\}\/auth\/revoke`/);
  assert.doesNotMatch(appleTokenWorker, /console\.(?:log|info|warn|error)/);
});

test("가족 전체 삭제는 모든 Apple 구성원의 자동 해지 준비 상태를 확인한다", () => {
  assert.match(appleTokenMigration, /get_family_apple_revocation_status/);
  assert.match(appleTokenMigration, /count\(distinct identity_row\.user_id\)/);
  assert.match(accountDeletionApi, /getFamilyAppleRevocationStatus\(supabase\)/);
  assert.match(accountDeletionApi, /appleAccessRevocationStatus: familyAppleRevocationStatus/);
  assert.match(accountDeletionScreen, /가족 구성원 중 자동 해지 준비가 안 된 Apple 계정/);
});

test("탈퇴 재인증은 자동 갱신 시각이 아니라 새 세션과 동일 사용자 여부를 확인한다", () => {
  assert.match(appleTokenMigration, /auth\.jwt\(\) ->> 'session_id'/);
  assert.match(appleTokenMigration, /from auth\.sessions/);
  assert.doesNotMatch(appleTokenMigration, /auth\.jwt\(\) ->> 'iat'/);
  assert.match(accountDeletionApi, /reauthenticatedSession\?\.user\.id === originalSession\.user\.id/);
  assert.match(accountDeletionApi, /restoreSessionAfterAccountMismatch/);
});

test("계정 삭제 뒤 원격 로그아웃이 실패해도 로컬 Supabase 세션을 제거한다", () => {
  assert.match(accountDeletionApi, /try \{[\s\S]*supabase\.auth\.signOut\(\)[\s\S]*finally \{[\s\S]*clearBabyBossSupabaseAuthSession/);
  assert.match(supabaseClient, /authStorage\.removeItem\(storageKey\)/);
  assert.match(supabaseClient, /authStorage\.removeItem\(`\$\{storageKey\}-code-verifier`\)/);
  const logoutAction = babyBossActions.slice(
    babyBossActions.indexOf("async function handleLogout()"),
    babyBossActions.indexOf("return {", babyBossActions.indexOf("async function handleLogout()")),
  );
  assert.match(logoutAction, /await runtime\.clearLocalSession\(\)/);
  assert.match(logoutAction, /runtime\.setBootstrap\(null\)/);
  assert.doesNotMatch(logoutAction, /fetchBootstrap\(/);
});
