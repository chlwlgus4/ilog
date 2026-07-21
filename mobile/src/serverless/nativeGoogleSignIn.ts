import Constants from "expo-constants";
import { Platform } from "react-native";

import { resolveNativeGoogleSignInConfig } from "./nativeGoogleSignInConfig";

interface NativeGoogleSignInExtra {
  googleWebClientId?: string;
  googleIosClientId?: string;
}

let configuredClientKey: string | null = null;

function readPublicEnv(name: string) {
  return typeof process !== "undefined" ? process.env?.[name]?.trim() ?? "" : "";
}

function readNativeGoogleSignInConfig() {
  const extra = (Constants.expoConfig?.extra ?? {}) as NativeGoogleSignInExtra;
  const platform = Platform.OS === "ios" ? "ios" : "android";

  return resolveNativeGoogleSignInConfig(
    {
      googleWebClientId: extra.googleWebClientId?.trim() || readPublicEnv("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"),
      googleIosClientId: extra.googleIosClientId?.trim() || readPublicEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"),
    },
    platform,
  );
}

export async function getNativeGoogleIdToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    throw new Error("웹에서는 Google OAuth 로그인을 사용해 주세요.");
  }

  const config = readNativeGoogleSignInConfig();
  const clientKey = `${config.webClientId}:${config.iosClientId ?? ""}`;
  const { GoogleSignin } = await import("@react-native-google-signin/google-signin");

  if (configuredClientKey !== clientKey) {
    GoogleSignin.configure({
      webClientId: config.webClientId,
      ...(config.iosClientId ? { iosClientId: config.iosClientId } : {}),
    });
    configuredClientKey = clientKey;
  }

  if (Platform.OS === "android") {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  const response = await GoogleSignin.signIn();

  if (response.type === "cancelled") {
    return null;
  }

  if (!response.data.idToken) {
    throw new Error("Google 계정에서 ID 토큰을 받지 못했어요. Google 웹 클라이언트 ID 설정을 확인해 주세요.");
  }

  return response.data.idToken;
}
