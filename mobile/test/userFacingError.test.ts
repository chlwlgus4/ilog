import assert from "node:assert/strict";
import test from "node:test";

import {
  genericServerErrorMessage,
  isTechnicalResponseMessage,
  sanitizeUserFacingError,
} from "../src/features/shared/userFacingError";

test("Supabase 5xx 응답 전문은 사용자에게 노출하지 않는다", () => {
  const rawResponse =
    '{"type":"default","status":500,"ok":false,"headers":{"map":{"cf-ray":"abc","sb-project-ref":"project"}}}';

  assert.equal(isTechnicalResponseMessage(rawResponse), true);
  assert.equal(sanitizeUserFacingError(rawResponse), genericServerErrorMessage);
});

test("일반 사용자 안내 문구는 그대로 유지한다", () => {
  const message = "비밀번호 재설정 메일을 보내지 못했어요.";

  assert.equal(isTechnicalResponseMessage(message), false);
  assert.equal(sanitizeUserFacingError(message), message);
});
