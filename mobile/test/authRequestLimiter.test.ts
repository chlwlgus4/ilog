import assert from "node:assert/strict";
import test from "node:test";

import {
  clearLoginAttempts,
  getLoginAttemptStatus,
  isInvalidLoginError,
  loginLockMessage,
  recordInvalidLoginAttempt,
  resetLoginAttemptsForTest,
} from "../src/features/auth/authRequestLimiter";

test.beforeEach(() => {
  resetLoginAttemptsForTest();
});

test("로그인을 5번 연속 실패하면 30초 동안 차단한다", () => {
  const email = "USER@example.com";
  const now = 1_000_000;

  for (let index = 0; index < 4; index += 1) {
    assert.equal(recordInvalidLoginAttempt(email, now + index).allowed, true);
  }

  const locked = recordInvalidLoginAttempt(email, now + 4);
  assert.equal(locked.allowed, false);
  assert.equal(locked.remainingMs, 30_000);
  assert.equal(getLoginAttemptStatus("user@example.com", now + 5).allowed, false);
});

test("차단이 끝난 뒤 다시 실패하면 대기 시간을 늘린다", () => {
  const email = "user@example.com";
  const now = 2_000_000;

  for (let index = 0; index < 5; index += 1) {
    recordInvalidLoginAttempt(email, now + index);
  }

  const afterFirstLock = now + 30_005;
  assert.equal(getLoginAttemptStatus(email, afterFirstLock).allowed, true);

  const lockedAgain = recordInvalidLoginAttempt(email, afterFirstLock);
  assert.equal(lockedAgain.allowed, false);
  assert.equal(lockedAgain.remainingMs, 60_000);
});

test("성공 처리 또는 15분 경과 후에는 실패 기록을 초기화한다", () => {
  const email = "user@example.com";
  const now = 3_000_000;

  recordInvalidLoginAttempt(email, now);
  clearLoginAttempts(email);
  assert.equal(getLoginAttemptStatus(email, now).allowed, true);

  recordInvalidLoginAttempt(email, now);
  assert.equal(getLoginAttemptStatus(email, now + 15 * 60 * 1000 + 1).allowed, true);
});

test("로그인 오류 판별과 대기 안내 문구를 사용자용으로 변환한다", () => {
  assert.equal(isInvalidLoginError(new Error("Invalid login credentials")), true);
  assert.equal(isInvalidLoginError(new Error("이메일 또는 비밀번호가 맞지 않습니다.")), true);
  assert.equal(isInvalidLoginError(new Error("Email not confirmed")), false);
  assert.equal(loginLockMessage(30_001), "로그인을 여러 번 실패했어요. 31초 후 다시 시도해 주세요.");
});
