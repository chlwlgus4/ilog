const genericServerErrorMessage = "서버 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";

const technicalResponsePattern = /(?:\{\s*[\"'](?:type|status|headers|statusText)[\"']\s*:|sb-project-ref|cf-ray|cf-cache-status|x-envoy|server-timing)/i;

/** Prevent transport payloads and response headers from reaching end-user alerts. */
export function isTechnicalResponseMessage(message: string) {
  return technicalResponsePattern.test(message);
}

export function sanitizeUserFacingError(message: string | null | undefined, fallback = genericServerErrorMessage) {
  const trimmedMessage = message?.trim() ?? "";

  if (!trimmedMessage || isTechnicalResponseMessage(trimmedMessage)) {
    return fallback;
  }

  return trimmedMessage;
}

export { genericServerErrorMessage };
