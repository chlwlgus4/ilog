export const FAMILY_CHAT_COMPOSER_RESTING_BOTTOM = 0;
export const FAMILY_CHAT_COMPOSER_KEYBOARD_GAP = 6;
export const FAMILY_CHAT_COMPOSER_RESERVED_HEIGHT = 152;

export type FamilyChatComposerPositionInput = {
  keyboardInset: number;
  bottomSafeAreaInset: number;
};

export function resolveFamilyChatComposerBottom({
  keyboardInset,
  bottomSafeAreaInset,
}: FamilyChatComposerPositionInput) {
  const normalizedKeyboardInset = Math.max(0, keyboardInset);

  if (normalizedKeyboardInset === 0) {
    return FAMILY_CHAT_COMPOSER_RESTING_BOTTOM;
  }

  return Math.max(
    FAMILY_CHAT_COMPOSER_KEYBOARD_GAP,
    normalizedKeyboardInset - Math.max(0, bottomSafeAreaInset) + FAMILY_CHAT_COMPOSER_KEYBOARD_GAP,
  );
}

export function familyChatComposerContentPaddingBottom(composerBottom: number) {
  return Math.max(0, composerBottom) + FAMILY_CHAT_COMPOSER_RESERVED_HEIGHT;
}
