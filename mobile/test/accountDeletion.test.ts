import type { CaregiverSummary, FamilySummary } from "../src/api";
import assert from "node:assert/strict";
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
