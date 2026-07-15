import assert from "node:assert/strict";
import test from "node:test";

import {
  TIMELINE_COMPOSER_MAX_HEIGHT,
  TIMELINE_COMPOSER_KEYBOARD_GAP,
  TIMELINE_COMPOSER_RESERVED_HEIGHT,
  TIMELINE_COMPOSER_RESTING_BOTTOM,
  TIMELINE_FAMILY_CHAT_GAP,
  resolveTimelineFamilyChatBottom,
  resolveTimelineComposerBottom,
  timelineComposerContentPaddingBottom,
} from "../src/features/chat/timelineComposerLayout";

test("키보드가 닫혀 있으면 메모 입력창을 빠른 추가 버튼 위에 둔다", () => {
  assert.equal(
    resolveTimelineComposerBottom({ keyboardInset: 0, bottomSafeAreaInset: 34 }),
    TIMELINE_COMPOSER_RESTING_BOTTOM,
  );
});

test("iPhone 키보드가 열리면 안전영역을 중복 적용하지 않고 6pt 간격을 유지한다", () => {
  const keyboardInset = 336;
  const safeAreaInset = 34;

  const composerBottom = resolveTimelineComposerBottom({
    keyboardInset,
    bottomSafeAreaInset: safeAreaInset,
  });

  assert.equal(composerBottom, keyboardInset - safeAreaInset + TIMELINE_COMPOSER_KEYBOARD_GAP);
  assert.equal(safeAreaInset + composerBottom - keyboardInset, TIMELINE_COMPOSER_KEYBOARD_GAP);
});

test("안전영역이 없는 기기에서도 키보드 위 여백을 일관되게 계산한다", () => {
  assert.equal(
    resolveTimelineComposerBottom({ keyboardInset: 280, bottomSafeAreaInset: 0 }),
    280 + TIMELINE_COMPOSER_KEYBOARD_GAP,
  );
});

test("타임라인 마지막 기록은 고정 입력창 아래로 가려지지 않도록 여유 공간을 확보한다", () => {
  const composerBottom = 256;
  assert.equal(
    timelineComposerContentPaddingBottom(composerBottom),
    composerBottom + TIMELINE_COMPOSER_RESERVED_HEIGHT,
  );
});

test("기록 화면의 가족 대화 버튼은 여러 줄 메모 입력창보다 위에 둔다", () => {
  const composerBottom = TIMELINE_COMPOSER_RESTING_BOTTOM;

  assert.equal(
    resolveTimelineFamilyChatBottom(composerBottom),
    composerBottom + TIMELINE_COMPOSER_MAX_HEIGHT + TIMELINE_FAMILY_CHAT_GAP,
  );
});
