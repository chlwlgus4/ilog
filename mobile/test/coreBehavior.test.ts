import assert from "node:assert/strict";
import test from "node:test";

import { nicknameForRoleChange, reminderLabel, roleDefaultNickname } from "../src/constants";
import {
  addMonths,
  endOfWeek,
  formatDateKey,
  shiftDateByPeriod,
  startOfWeek,
} from "../src/features/shared/calendarDateUtils";
import { IOS_TAB_BAR_BOTTOM_OFFSET, resolveBottomTabBarOffset } from "../src/features/shared/bottomTabLayout";

test("역할 변경 시 기본 닉네임만 새 역할의 기본값으로 바꾼다", () => {
  assert.equal(nicknameForRoleChange(roleDefaultNickname.MOM, "MOM", "DAD"), "아빠");
  assert.equal(nicknameForRoleChange("지현", "MOM", "DAD"), "지현");
  assert.equal(nicknameForRoleChange("", "GUARDIAN", "MOM"), "엄마");
});

test("통계 날짜 이동은 월말과 주간 경계를 올바르게 처리한다", () => {
  const januaryThirtyFirst = new Date(2026, 0, 31);
  assert.equal(formatDateKey(addMonths(januaryThirtyFirst, 1)), "2026-02-28");

  const sunday = new Date(2026, 6, 12);
  assert.equal(formatDateKey(startOfWeek(sunday)), "2026-07-06");
  assert.equal(formatDateKey(endOfWeek(sunday)), "2026-07-12");
  assert.equal(formatDateKey(shiftDateByPeriod(sunday, "weekly", -1)), "2026-07-05");
});

test("알림 시간 라벨은 분과 시간을 사용자에게 읽기 쉽게 표시한다", () => {
  assert.equal(reminderLabel(null), "리마인더 없음");
  assert.equal(reminderLabel(30), "30분 전");
  assert.equal(reminderLabel(90), "1시간 30분 전");
});

test("iOS 하단 탭은 안전영역 안에서만 조금 더 아래로 배치한다", () => {
  assert.equal(resolveBottomTabBarOffset("ios"), IOS_TAB_BAR_BOTTOM_OFFSET);
  assert.equal(resolveBottomTabBarOffset("android"), 0);
  assert.equal(resolveBottomTabBarOffset("web"), 0);
});
