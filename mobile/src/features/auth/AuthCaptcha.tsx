import { forwardRef, useImperativeHandle } from "react";

import type { AuthCaptchaHandle } from "./authCaptchaTypes";

export const AuthCaptcha = forwardRef<AuthCaptchaHandle>(function AuthCaptcha(_props, ref) {
  useImperativeHandle(ref, () => ({
    verify: () =>
      Promise.reject(
        new Error("보안 확인은 아이로그 iOS 또는 Android 앱에서 진행해 주세요."),
      ),
    cancel: () => undefined,
  }), []);

  return null;
});
