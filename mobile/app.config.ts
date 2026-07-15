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
const defaultEasProjectId = "8727d543-a698-4671-a97c-1e8bd3be7722";
const configuredEasProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || defaultEasProjectId;

const extra: ExpoConfig["extra"] = {
  supabaseUrl: configuredSupabaseUrl,
  supabaseAnonKey: configuredSupabaseAnonKey,
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
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleId,
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
