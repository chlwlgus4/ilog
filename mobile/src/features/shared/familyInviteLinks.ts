import Constants from "expo-constants";

import { buildFamilyInviteUrl, normalizeFamilyInviteCode } from "./familyInviteLinkUtils";

const appScheme = "ilog";

type FamilyInviteRuntimeConfig = {
  inviteBaseUrl?: string;
  iosAppStoreUrl?: string;
  androidPlayStoreUrl?: string;
};

export { normalizeFamilyInviteCode };

export function getFamilyInviteLink(inviteCode: string | string[] | null | undefined) {
  const normalizedInviteCode = normalizeFamilyInviteCode(inviteCode);

  return buildFamilyInviteUrl({
    inviteCode: normalizedInviteCode,
    inviteBaseUrl: getRuntimeConfig().inviteBaseUrl,
    fallbackUrl: getFamilyInviteAppLink(normalizedInviteCode),
  });
}

export function getFamilyInviteAppLink(inviteCode: string | string[] | null | undefined) {
  const normalizedInviteCode = normalizeFamilyInviteCode(inviteCode);
  return `${appScheme}://invite?invite_code=${encodeURIComponent(normalizedInviteCode)}`;
}

export function getFamilyInviteStoreLinks() {
  const config = getRuntimeConfig();

  return {
    ios: normalizeHttpsUrl(config.iosAppStoreUrl),
    android: normalizeHttpsUrl(config.androidPlayStoreUrl),
  };
}

function getRuntimeConfig(): FamilyInviteRuntimeConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

  return {
    inviteBaseUrl: stringValue(extra.inviteBaseUrl) || process.env.EXPO_PUBLIC_INVITE_BASE_URL?.trim() || "",
    iosAppStoreUrl: stringValue(extra.iosAppStoreUrl) || process.env.EXPO_PUBLIC_IOS_APP_STORE_URL?.trim() || "",
    androidPlayStoreUrl: stringValue(extra.androidPlayStoreUrl) || process.env.EXPO_PUBLIC_ANDROID_PLAY_STORE_URL?.trim() || "",
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHttpsUrl(value: string | undefined) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}
