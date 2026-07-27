import assert from "node:assert/strict";
import test from "node:test";

import { currentLegalConsent, legalDocumentVersions } from "../src/legalDocuments";

test("현재 약관 동의 버전은 약관과 개인정보 처리방침에 같은 시행일을 사용한다", () => {
  assert.deepEqual(currentLegalConsent(), {
    termsVersion: "2026-07-26",
    privacyVersion: "2026-07-26",
  });
  assert.equal(legalDocumentVersions.terms, legalDocumentVersions.privacy);
});
