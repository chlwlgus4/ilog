import assert from "node:assert/strict";
import test from "node:test";

import { resolveLoginContentPadding } from "../src/features/auth/loginLayout";

test("Android 로그인 화면은 하단 여백을 확보하고 상단 공간을 줄인다", () => {
  assert.deepEqual(resolveLoginContentPadding("android", 22), {
    paddingTop: 46,
    paddingBottom: 24,
  });
});

test("iOS와 웹 로그인 화면은 기존 상단 간격과 하단 여백을 유지한다", () => {
  assert.deepEqual(resolveLoginContentPadding("ios", 22), {
    paddingTop: 58,
    paddingBottom: 24,
  });
  assert.deepEqual(resolveLoginContentPadding("web", 22), {
    paddingTop: 58,
    paddingBottom: 24,
  });
});
