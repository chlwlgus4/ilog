import assert from "node:assert/strict";
import test from "node:test";

import { resolveNativeGoogleSignInConfig } from "../src/serverless/nativeGoogleSignInConfig";

test("네이티브 Google 로그인은 웹 클라이언트 ID를 요구한다", () => {
  assert.throws(
    () => resolveNativeGoogleSignInConfig({}, "android"),
    /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID/,
  );
});

test("iOS 네이티브 Google 로그인은 iOS 클라이언트 ID도 요구한다", () => {
  assert.throws(
    () => resolveNativeGoogleSignInConfig({ googleWebClientId: "web-client" }, "ios"),
    /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID/,
  );
});

test("Android 네이티브 Google 로그인은 웹 클라이언트 ID만 사용한다", () => {
  assert.deepEqual(
    resolveNativeGoogleSignInConfig({ googleWebClientId: "web-client" }, "android"),
    { webClientId: "web-client" },
  );
});

test("Google 클라이언트 ID의 앞뒤 공백을 제거해 네이티브 SDK에 전달한다", () => {
  assert.deepEqual(
    resolveNativeGoogleSignInConfig(
      {
        googleWebClientId: " web-client ",
        googleIosClientId: " ios-client ",
      },
      "ios",
    ),
    {
      webClientId: "web-client",
      iosClientId: "ios-client",
    },
  );
});
