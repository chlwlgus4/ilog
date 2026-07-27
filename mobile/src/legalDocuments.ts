export const legalDocumentVersions = {
  terms: "2026-07-26",
  privacy: "2026-07-26",
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
