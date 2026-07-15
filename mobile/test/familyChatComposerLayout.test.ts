import assert from "node:assert/strict";
import test from "node:test";

import {
  FAMILY_CHAT_COMPOSER_KEYBOARD_GAP,
  FAMILY_CHAT_COMPOSER_RESERVED_HEIGHT,
  FAMILY_CHAT_COMPOSER_RESTING_BOTTOM,
  familyChatComposerContentPaddingBottom,
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

test("마지막 가족 메시지는 고정 입력창 뒤로 숨지 않도록 여유 공간을 확보한다", () => {
  const composerBottom = 256;
  assert.equal(
    familyChatComposerContentPaddingBottom(composerBottom),
    composerBottom + FAMILY_CHAT_COMPOSER_RESERVED_HEIGHT,
  );
});
