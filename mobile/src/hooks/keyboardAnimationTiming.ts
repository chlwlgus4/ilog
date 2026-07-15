export const KEYBOARD_COMPOSER_DURATION_FACTOR = 0.72;
export const KEYBOARD_COMPOSER_MIN_DURATION_MS = 120;

export function resolveKeyboardComposerAnimationDuration(nativeDuration: number) {
  return Math.max(
    KEYBOARD_COMPOSER_MIN_DURATION_MS,
    Math.round(Math.max(0, nativeDuration) * KEYBOARD_COMPOSER_DURATION_FACTOR),
  );
}
