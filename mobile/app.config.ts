import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";

import type { ExpoConfig } from "expo/config";

const localEnvPath = join(process.cwd(), ".env");
if (existsSync(localEnvPath)) {
  loadEnvFile(localEnvPath);
}

const bundleId = "com.ilog.mobile";
const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
const configuredSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const configuredGoogleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "";
const configuredGoogleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "";
const configuredGoogleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim() ?? "";
const configuredInviteBaseUrl = normalizeHttpsUrl(process.env.EXPO_PUBLIC_INVITE_BASE_URL, true);
const configuredIosAppStoreUrl = normalizeHttpsUrl(process.env.EXPO_PUBLIC_IOS_APP_STORE_URL);
const configuredAndroidPlayStoreUrl = normalizeHttpsUrl(process.env.EXPO_PUBLIC_ANDROID_PLAY_STORE_URL);
const inviteLinkSettings = resolveInviteLinkSettings(configuredInviteBaseUrl);
const defaultEasProjectId = "8727d543-a698-4671-a97c-1e8bd3be7722";
const configuredEasProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || defaultEasProjectId;
const googleSignInPlugin: [string, { iosUrlScheme: string }] | null = configuredGoogleIosUrlScheme
  ? [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme: configuredGoogleIosUrlScheme,
      },
    ]
  : null;

function normalizeHttpsUrl(value: string | undefined, stripSearchAndHash = false) {
  const rawValue = value?.trim();
  if (!rawValue) {
    return "";
  }

  try {
    const url = new URL(rawValue);
    if (url.protocol !== "https:") {
      return "";
    }

    if (stripSearchAndHash) {
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return "";
  }
}

function resolveInviteLinkSettings(inviteBaseUrl: string) {
  if (!inviteBaseUrl) {
    return null;
  }

  const url = new URL(inviteBaseUrl);
  const basePath = url.pathname.replace(/\/+$/, "");

  return {
    host: url.hostname,
    pathPrefix: `${basePath}/invite` || "/invite",
  };
}

const extra: ExpoConfig["extra"] = {
  supabaseUrl: configuredSupabaseUrl,
  supabaseAnonKey: configuredSupabaseAnonKey,
  googleWebClientId: configuredGoogleWebClientId,
  googleIosClientId: configuredGoogleIosClientId,
  inviteBaseUrl: configuredInviteBaseUrl,
  iosAppStoreUrl: configuredIosAppStoreUrl,
  androidPlayStoreUrl: configuredAndroidPlayStoreUrl,
  bundleId,
  ...(configuredEasProjectId
    ? {
        eas: {
          projectId: configuredEasProjectId,
        },
        easProjectId: configuredEasProjectId,
      }
    : {}),
};

const config: ExpoConfig = {
  owner: "rlaahwl",
  name: "아이로그",
  slug: "ilog",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "ilog",
  icon: "./assets/ilog-logo.png",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/ilog-logo-transparent.png",
    resizeMode: "contain",
    backgroundColor: "#FFFFFF",
  },
  plugins: [
    "expo-router",
    "expo-notifications",
    [
      "expo-image-picker",
      {
        photosPermission: "사진 앨범에 사진을 추가하려면 사진 접근 권한이 필요해요.",
      },
    ],
    [
      "expo-media-library",
      {
        savePhotosPermission: "사진 앨범의 사진을 기기에 저장하려면 사진 보관함 접근 권한이 필요해요.",
        granularPermissions: ["photo"],
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/ilog-logo-transparent.png",
        imageWidth: 300,
        resizeMode: "contain",
        backgroundColor: "#FFFFFF",
      },
    ],
    [
      "expo-font",
      {
        fonts: ["./assets/fonts/PretendardVariable.ttf"],
        android: {
          fonts: [
            {
              fontFamily: "Pretendard",
              fontDefinitions: [
                { path: "./assets/fonts/Pretendard-Regular.otf", weight: 400 },
                { path: "./assets/fonts/Pretendard-Medium.otf", weight: 500 },
                { path: "./assets/fonts/Pretendard-SemiBold.otf", weight: 600 },
                { path: "./assets/fonts/Pretendard-Bold.otf", weight: 700 },
              ],
            },
          ],
        },
      },
    ],
    ...(googleSignInPlugin ? [googleSignInPlugin] : []),
    "./plugins/withGoogleSignInModularHeaders",
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
    ...(inviteLinkSettings ? { associatedDomains: [`applinks:${inviteLinkSettings.host}`] } : {}),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleId,
    ...(inviteLinkSettings
      ? {
          intentFilters: [
            {
              action: "VIEW",
              autoVerify: true,
              data: [
                {
                  scheme: "https",
                  host: inviteLinkSettings.host,
                  pathPrefix: inviteLinkSettings.pathPrefix,
                },
              ],
              category: ["BROWSABLE", "DEFAULT"],
            },
          ],
        }
      : {}),
    adaptiveIcon: {
      backgroundColor: "#FFFFFF",
      foregroundImage: "./assets/ilog-logo-transparent.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/ilog-favicon.png",
  },
  extra,
};

export default config;
