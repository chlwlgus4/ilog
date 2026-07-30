import type { LegalConsentVersions } from "../legalDocuments";
import { authStorage } from "./authStorage";

const pendingGoogleLegalConsentKey = "ilog.pending-google-legal-consent";

export async function storePendingGoogleLegalConsent(consent: LegalConsentVersions | null | undefined) {
  if (!consent) {
    await authStorage.removeItem(pendingGoogleLegalConsentKey);
    return;
  }

  await authStorage.setItem(pendingGoogleLegalConsentKey, JSON.stringify(consent));
}

export async function takePendingGoogleLegalConsent(): Promise<LegalConsentVersions | null> {
  const serialized = await authStorage.getItem(pendingGoogleLegalConsentKey);
  await authStorage.removeItem(pendingGoogleLegalConsentKey);

  if (!serialized) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized) as Partial<LegalConsentVersions>;
    return typeof parsed.termsVersion === "string" && typeof parsed.privacyVersion === "string"
      ? { termsVersion: parsed.termsVersion, privacyVersion: parsed.privacyVersion }
      : null;
  } catch {
    return null;
  }
}
