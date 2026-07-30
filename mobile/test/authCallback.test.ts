import assert from "node:assert/strict";
import test from "node:test";

import {
  authCallbackErrorMessage,
  hasAuthCallbackCredentials,
  parseAuthCallbackUrl,
} from "../src/serverless/authCallback";

test("이메일 확인 PKCE 코드는 초대 코드와 함께 읽는다", () => {
  assert.deepEqual(
    parseAuthCallbackUrl("ilog://auth/email-confirmed?code=pkce-code&invite_code=bb-ab12"),
    {
      inviteCode: "BB-AB12",
      code: "pkce-code",
      accessToken: null,
      refreshToken: null,
      type: null,
      errorCode: null,
      errorDescription: null,
    },
  );
});

test("비밀번호 복구 토큰은 URL fragment에서 읽는다", () => {
  assert.deepEqual(
    parseAuthCallbackUrl(
      "ilog://auth/reset-password#access_token=access&refresh_token=refresh&type=recovery",
    ),
    {
      inviteCode: null,
      code: null,
      accessToken: "access",
      refreshToken: "refresh",
      type: "recovery",
      errorCode: null,
      errorDescription: null,
    },
  );
});

test("인증 제공자가 전달한 오류 설명을 보존한다", () => {
  assert.deepEqual(
    parseAuthCallbackUrl(
      "ilog://auth/email-confirmed?error=access_denied&error_description=Link%20expired",
    ),
    {
      inviteCode: null,
      code: null,
      accessToken: null,
      refreshToken: null,
      type: null,
      errorCode: "access_denied",
      errorDescription: "Link expired",
    },
  );
});

test("만료되거나 사용된 링크 오류는 한글 안내로 변환한다", () => {
  const params = parseAuthCallbackUrl(
    "ilog://auth/email-confirmed?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
  );

  assert.equal(
    authCallbackErrorMessage(params),
    "인증 링크가 만료되었거나 이미 사용되었어요. 새 메일을 요청해 다시 시도해 주세요.",
  );
});

test("알 수 없는 인증 서버 오류도 영문 원문을 노출하지 않는다", () => {
  const params = parseAuthCallbackUrl(
    "ilog://auth/email-confirmed?error=server_error&error_description=Unexpected+provider+failure",
  );

  assert.equal(
    authCallbackErrorMessage(params),
    "인증을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
  );
});

test("비밀번호 재설정은 코드 또는 토큰 쌍이 있는 링크만 허용한다", () => {
  assert.equal(
    hasAuthCallbackCredentials(
      parseAuthCallbackUrl("ilog://auth/reset-password"),
    ),
    false,
  );
  assert.equal(
    hasAuthCallbackCredentials(
      parseAuthCallbackUrl("ilog://auth/reset-password?code=recovery-code"),
    ),
    true,
  );
  assert.equal(
    hasAuthCallbackCredentials(
      parseAuthCallbackUrl(
        "ilog://auth/reset-password#access_token=access&refresh_token=refresh&type=recovery",
      ),
    ),
    true,
  );
  assert.equal(
    hasAuthCallbackCredentials(
      parseAuthCallbackUrl(
        "ilog://auth/reset-password#access_token=access&type=recovery",
      ),
    ),
    false,
  );
});
