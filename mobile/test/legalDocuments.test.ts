import assert from "node:assert/strict";
import test from "node:test";

import { currentLegalConsent, legalDocumentVersions } from "../src/legalDocuments";

test("현재 약관과 개인정보 처리방침 동의 버전을 반환한다", () => {
  assert.deepEqual(currentLegalConsent(), {
    termsVersion: "2026-07-26",
    privacyVersion: "2026-07-30",
  });
  assert.equal(legalDocumentVersions.terms, "2026-07-26");
  assert.equal(legalDocumentVersions.privacy, "2026-07-30");
});
