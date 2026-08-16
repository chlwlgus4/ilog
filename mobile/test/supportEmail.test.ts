import assert from "node:assert/strict";
import test from "node:test";

import { buildSupportEmailUrl, SUPPORT_EMAIL } from "../src/features/settings/supportEmail";

test("고객지원 메일 제목과 본문을 공백 및 줄바꿈이 보존되도록 인코딩한다", () => {
  const subject = "[아이로그] 고객지원 문의";
  const body = "문의 유형: 이용 문의 / 오류 신고\n문의 내용:\n";
  const url = buildSupportEmailUrl(subject, body);
  const parsed = new URL(url);

  assert.equal(parsed.pathname, SUPPORT_EMAIL);
  assert.equal(parsed.searchParams.get("subject"), subject);
  assert.equal(parsed.searchParams.get("body"), body);
  assert.equal(url.includes("+"), false);
  assert.match(url, /%20/);
  assert.match(url, /%0A/);
});
