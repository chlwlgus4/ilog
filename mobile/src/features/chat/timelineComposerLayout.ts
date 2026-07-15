export const TIMELINE_COMPOSER_RESTING_BOTTOM = 114;
export const TIMELINE_COMPOSER_KEYBOARD_GAP = 6;
export const TIMELINE_COMPOSER_RESERVED_HEIGHT = 144;
export const TIMELINE_COMPOSER_MAX_HEIGHT = 94;
export const TIMELINE_FAMILY_CHAT_GAP = 12;

export type TimelineComposerPositionInput = {
  keyboardInset: number;
  bottomSafeAreaInset: number;
};

export function resolveTimelineComposerBottom({
  keyboardInset,
  bottomSafeAreaInset,
}: TimelineComposerPositionInput) {
  const normalizedKeyboardInset = Math.max(0, keyboardInset);

  if (normalizedKeyboardInset === 0) {
    return TIMELINE_COMPOSER_RESTING_BOTTOM;
  }

  return Math.max(
    TIMELINE_COMPOSER_KEYBOARD_GAP,
    normalizedKeyboardInset - Math.max(0, bottomSafeAreaInset) + TIMELINE_COMPOSER_KEYBOARD_GAP,
  );
}

export function timelineComposerContentPaddingBottom(composerBottom: number) {
  return Math.max(0, composerBottom) + TIMELINE_COMPOSER_RESERVED_HEIGHT;
}

export function resolveTimelineFamilyChatBottom(composerBottom: number) {
  return Math.max(0, composerBottom) + TIMELINE_COMPOSER_MAX_HEIGHT + TIMELINE_FAMILY_CHAT_GAP;
}
