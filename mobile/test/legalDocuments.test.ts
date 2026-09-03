import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { currentLegalConsent, legalDocumentVersions } from "../src/legalDocuments";

test("현재 약관과 개인정보 처리방침 동의 버전을 반환한다", () => {
  assert.deepEqual(currentLegalConsent(), {
    termsVersion: "2026-09-03",
    privacyVersion: "2026-09-03",
  });
  assert.equal(legalDocumentVersions.terms, "2026-09-03");
  assert.equal(legalDocumentVersions.privacy, "2026-09-03");
});

test("운영 DB는 새 문서 재동의와 직전 앱 버전의 하위 호환을 함께 지원한다", () => {
  const migration = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "supabase",
      "migrations",
      "20260902132255_update_account_deletion_legal_policy.sql",
    ),
    "utf8",
  );

  assert.match(migration, /\('2026-07-26', '2026-07-30'\)/);
  assert.match(migration, /\('2026-09-02', '2026-09-02'\)/);
  assert.match(
    migration,
    /create or replace function public\.record_current_caregiver_legal_consents/,
  );
  assert.match(
    migration,
    /create or replace function public\.has_current_caregiver_legal_consents/,
  );
});
