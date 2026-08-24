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
const apiContract = readFileSync(join(mobileRoot, "src", "api.ts"), "utf8");
const accountDeletionApi = readFileSync(join(mobileRoot, "src", "serverless", "babyBossSupabaseApi.ts"), "utf8");
const nativeAppleSignIn = readFileSync(join(mobileRoot, "src", "serverless", "nativeAppleSignIn.ts"), "utf8");
const supabaseClient = readFileSync(join(mobileRoot, "src", "serverless", "supabase.ts"), "utf8");
const accountDeletionScreen = readFileSync(join(mobileRoot, "src", "screens", "BabyBossExtraScreens.tsx"), "utf8");

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

test("Apple 계정 삭제는 데이터 삭제 결과와 수동 연결 해제 안내를 함께 반환한다", () => {
  assert.match(apiContract, /appleAccessRevocationRequired: boolean/);
  assert.match(accountDeletionApi, /appleAccessRevocationRequired: authMethods\.apple/);
  assert.match(apiContract, /https:\/\/support\.apple\.com\/ko-kr\/102571/);
  assert.match(accountDeletionScreen, /requestAccountDeletion[\s\S]*appleAccessRevocationRequired[\s\S]*openAppleAccessRevocationGuide/);
});

test("Apple authorization code는 서버 교환을 위한 메모리 값으로만 보존한다", () => {
  assert.match(nativeAppleSignIn, /authorizationCode: credential\.authorizationCode/);
  assert.doesNotMatch(nativeAppleSignIn, /SecureStore|AsyncStorage|console\.(?:log|info|warn|error)/);
});

test("계정 삭제 뒤 원격 로그아웃이 실패해도 로컬 Supabase 세션을 제거한다", () => {
  assert.match(accountDeletionApi, /try \{[\s\S]*supabase\.auth\.signOut\(\)[\s\S]*finally \{[\s\S]*clearBabyBossSupabaseAuthSession/);
  assert.match(supabaseClient, /authStorage\.removeItem\(storageKey\)/);
  assert.match(supabaseClient, /authStorage\.removeItem\(`\$\{storageKey\}-code-verifier`\)/);
});
