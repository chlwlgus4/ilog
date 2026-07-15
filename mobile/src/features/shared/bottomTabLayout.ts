export const IOS_TAB_BAR_BOTTOM_OFFSET = -10;

export function resolveBottomTabBarOffset(platform: string) {
  return platform === "ios" ? IOS_TAB_BAR_BOTTOM_OFFSET : 0;
}
