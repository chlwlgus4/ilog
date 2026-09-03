export const LOGIN_CONTENT_BOTTOM_PADDING = 24;
export const LOGIN_DEFAULT_TOP_OFFSET = 36;
export const LOGIN_ANDROID_TOP_OFFSET = 24;

export function resolveLoginContentPadding(platform: string, safeTop: number) {
  return {
    paddingTop: safeTop + (platform === "android" ? LOGIN_ANDROID_TOP_OFFSET : LOGIN_DEFAULT_TOP_OFFSET),
    paddingBottom: LOGIN_CONTENT_BOTTOM_PADDING,
  };
}
