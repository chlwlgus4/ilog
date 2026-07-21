import assert from "node:assert/strict";
import test from "node:test";

import {
  FAMILY_CHAT_COMPOSER_KEYBOARD_GAP,
  FAMILY_CHAT_COMPOSER_RESERVED_HEIGHT,
  FAMILY_CHAT_COMPOSER_RESTING_BOTTOM,
  familyChatMessageViewportBottomInset,
  resolveFamilyChatComposerBottom,
} from "../src/features/chat/familyChatComposerLayout";

test("가족 대화 입력창은 키보드가 닫혀 있으면 하단 안전영역 바로 위에 둔다", () => {
  assert.equal(
    resolveFamilyChatComposerBottom({ keyboardInset: 0, bottomSafeAreaInset: 34 }),
    FAMILY_CHAT_COMPOSER_RESTING_BOTTOM,
  );
});

test("iPhone 키보드가 열리면 가족 대화 입력창을 키보드 바로 위로 올린다", () => {
  const keyboardInset = 336;
  const safeAreaInset = 34;

  const composerBottom = resolveFamilyChatComposerBottom({
    keyboardInset,
    bottomSafeAreaInset: safeAreaInset,
  });

  assert.equal(composerBottom, keyboardInset - safeAreaInset + FAMILY_CHAT_COMPOSER_KEYBOARD_GAP);
  assert.equal(safeAreaInset + composerBottom - keyboardInset, FAMILY_CHAT_COMPOSER_KEYBOARD_GAP);
});

test("안전영역이 없는 기기에서도 가족 대화 입력창의 키보드 간격을 유지한다", () => {
  assert.equal(
    resolveFamilyChatComposerBottom({ keyboardInset: 280, bottomSafeAreaInset: 0 }),
    280 + FAMILY_CHAT_COMPOSER_KEYBOARD_GAP,
  );
});

test("메시지 영역은 키보드 이동량과 실제 입력창 높이만큼 함께 위로 이동한다", () => {
  const composerBottom = 256;
  const composerHeight = 72;

  assert.equal(familyChatMessageViewportBottomInset(composerBottom, composerHeight), 328);
  assert.equal(
    familyChatMessageViewportBottomInset(composerBottom),
    composerBottom + FAMILY_CHAT_COMPOSER_RESERVED_HEIGHT,
  );
});
