import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthCaptchaCancelledError,
  isAuthCaptchaCancelled,
  runAuthCaptcha,
  type AuthCaptchaHandle,
} from "../src/features/auth/authCaptchaTypes";

test("보안 확인 토큰을 인증 요청에 전달하고 사용 완료 처리한다", async () => {
  let markedUsed = false;
  const captcha: AuthCaptchaHandle = {
    verify: async () => ({
      token: "captcha-token",
      markUsed: () => {
        markedUsed = true;
      },
    }),
    cancel: () => undefined,
  };

  const result = await runAuthCaptcha({ current: captcha }, async (token) => {
    assert.equal(token, "captcha-token");
    return "done";
  });

  assert.equal(result, "done");
  assert.equal(markedUsed, true);
});

test("인증 요청이 실패해도 CAPTCHA 토큰을 다시 사용하지 않도록 종료한다", async () => {
  let markedUsed = false;
  const captcha: AuthCaptchaHandle = {
    verify: async () => ({
      token: "captcha-token",
      markUsed: () => {
        markedUsed = true;
      },
    }),
    cancel: () => undefined,
  };

  await assert.rejects(
    runAuthCaptcha({ current: captcha }, async () => {
      throw new Error("request failed");
    }),
    /request failed/,
  );
  assert.equal(markedUsed, true);
});

test("사용자가 보안 확인을 닫은 경우 취소 오류로 구분한다", () => {
  assert.equal(isAuthCaptchaCancelled(new AuthCaptchaCancelledError()), true);
  assert.equal(isAuthCaptchaCancelled(new Error("other error")), false);
});
