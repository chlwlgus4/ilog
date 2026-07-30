import type { RefObject } from "react";

export interface AuthCaptchaVerification {
  token: string;
  markUsed: () => void;
}

export interface AuthCaptchaHandle {
  verify: () => Promise<AuthCaptchaVerification>;
  cancel: () => void;
}

export class AuthCaptchaCancelledError extends Error {
  constructor() {
    super("Auth CAPTCHA was cancelled");
    this.name = "AuthCaptchaCancelledError";
  }
}

export function isAuthCaptchaCancelled(error: unknown) {
  return error instanceof AuthCaptchaCancelledError;
}

export async function runAuthCaptcha<T>(
  ref: RefObject<AuthCaptchaHandle | null>,
  work: (captchaToken: string) => Promise<T>,
) {
  const captcha = ref.current;

  if (!captcha) {
    throw new Error("보안 확인을 준비하지 못했어요. 앱을 다시 실행한 뒤 시도해 주세요.");
  }

  const verification = await captcha.verify();

  try {
    return await work(verification.token);
  } finally {
    verification.markUsed();
  }
}
