import assert from "node:assert/strict";
import test from "node:test";

import { buildAppAuthRedirectUrl } from "../src/serverless/authRedirect";

test("이메일 확인 링크는 운영 앱 딥링크를 사용한다", () => {
  assert.equal(
    buildAppAuthRedirectUrl("auth/email-confirmed"),
    "ilog://auth/email-confirmed",
  );
});

test("가족 초대 코드는 정규화해 이메일 확인 딥링크에 보존한다", () => {
  assert.equal(
    buildAppAuthRedirectUrl("/auth/email-confirmed", " bb-family 1 "),
    "ilog://auth/email-confirmed?invite_code=BB-FAMILY%201",
  );
});

test("비밀번호 재설정 링크도 운영 앱 딥링크를 사용한다", () => {
  assert.equal(
    buildAppAuthRedirectUrl("auth/reset-password"),
    "ilog://auth/reset-password",
  );
});
