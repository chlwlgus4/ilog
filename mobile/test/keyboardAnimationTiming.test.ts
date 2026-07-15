import assert from "node:assert/strict";
import test from "node:test";

import {
  KEYBOARD_COMPOSER_DURATION_FACTOR,
  KEYBOARD_COMPOSER_MIN_DURATION_MS,
  resolveKeyboardComposerAnimationDuration,
} from "../src/hooks/keyboardAnimationTiming";

test("입력창은 iOS 키보드 기본 이동 시간보다 빠르게 도착한다", () => {
  assert.equal(KEYBOARD_COMPOSER_DURATION_FACTOR, 0.72);
  assert.equal(resolveKeyboardComposerAnimationDuration(250), 180);
});

test("아주 짧은 키보드 이벤트에서도 입력창 애니메이션이 즉시 끝나지 않는다", () => {
  assert.equal(resolveKeyboardComposerAnimationDuration(0), KEYBOARD_COMPOSER_MIN_DURATION_MS);
  assert.equal(resolveKeyboardComposerAnimationDuration(160), KEYBOARD_COMPOSER_MIN_DURATION_MS);
});
