export const legalDocumentVersions = {
  terms: "2026-09-03",
  privacy: "2026-09-03",
} as const;

export interface LegalConsentVersions {
  termsVersion: string;
  privacyVersion: string;
}

export function currentLegalConsent(): LegalConsentVersions {
  return {
    termsVersion: legalDocumentVersions.terms,
    privacyVersion: legalDocumentVersions.privacy,
  };
}
