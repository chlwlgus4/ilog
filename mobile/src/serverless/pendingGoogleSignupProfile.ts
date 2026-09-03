import {
  normalizeOAuthSignupProfile,
  type OAuthSignupProfile,
} from "../features/auth/oauthSignupProfile";
import { authStorage } from "./authStorage";

const pendingGoogleSignupProfileKey = "ilog.pending-google-signup-profile";

export async function storePendingGoogleSignupProfile(
  profile: OAuthSignupProfile | null | undefined,
) {
  const normalized = normalizeOAuthSignupProfile(profile);

  if (!normalized) {
    await authStorage.removeItem(pendingGoogleSignupProfileKey);
    return;
  }

  await authStorage.setItem(pendingGoogleSignupProfileKey, JSON.stringify(normalized));
}

export async function takePendingGoogleSignupProfile(): Promise<OAuthSignupProfile | null> {
  const serialized = await authStorage.getItem(pendingGoogleSignupProfileKey);
  await authStorage.removeItem(pendingGoogleSignupProfileKey);

  if (!serialized) {
    return null;
  }

  try {
    return normalizeOAuthSignupProfile(JSON.parse(serialized) as Partial<OAuthSignupProfile>);
  } catch {
    return null;
  }
}
