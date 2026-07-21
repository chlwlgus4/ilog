import assert from "node:assert/strict";
import test from "node:test";

import { stablePushDeviceId } from "../src/serverless/pushDeviceIdentity";

test("iOS 푸시 등록은 세션 값이 아닌 iOS 기기 식별자를 사용한다", () => {
  assert.equal(
    stablePushDeviceId({ platform: "ios", iosId: "  ios-vendor-id  ", androidId: "android-id" }),
    "ios-vendor-id",
  );
});

test("Android 푸시 등록은 Android 기기 식별자를 사용한다", () => {
  assert.equal(
    stablePushDeviceId({ platform: "android", iosId: "ios-vendor-id", androidId: "android-id" }),
    "android-id",
  );
});

test("지원하지 않는 플랫폼 또는 빈 식별자는 기기 값을 저장하지 않는다", () => {
  assert.equal(stablePushDeviceId({ platform: "web", iosId: "ios-vendor-id", androidId: "android-id" }), null);
  assert.equal(stablePushDeviceId({ platform: "ios", iosId: "  ", androidId: null }), null);
});
