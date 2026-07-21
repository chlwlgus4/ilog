export type NativeGoogleSignInPlatform = "android" | "ios";

export interface NativeGoogleSignInConfigInput {
  googleWebClientId?: string | null;
  googleIosClientId?: string | null;
}

export interface NativeGoogleSignInConfig {
  webClientId: string;
  iosClientId?: string;
}

function normalizeConfiguredValue(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function resolveNativeGoogleSignInConfig(
  input: NativeGoogleSignInConfigInput,
  platform: NativeGoogleSignInPlatform,
): NativeGoogleSignInConfig {
  const webClientId = normalizeConfiguredValue(input.googleWebClientId);
  const iosClientId = normalizeConfiguredValue(input.googleIosClientId);

  if (!webClientId) {
    throw new Error("Google 네이티브 로그인을 사용하려면 EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID를 설정해 주세요.");
  }

  if (platform === "ios" && !iosClientId) {
    throw new Error("iOS Google 로그인을 사용하려면 EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID를 설정해 주세요.");
  }

  return {
    webClientId,
    ...(iosClientId ? { iosClientId } : {}),
  };
}
