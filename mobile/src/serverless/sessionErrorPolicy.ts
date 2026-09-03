const terminalSessionMessages = [
  "저장된 로그인 세션이 없어요",
  "현재 보호자 정보를 찾지 못했어요",
  "가족 정보를 찾지 못했어요",
];

const terminalSessionPatterns = [
  /auth session missing/i,
  /session not found/i,
  /invalid refresh token/i,
  /refresh token (?:is )?not found/i,
  /refresh_token_not_found/i,
];

const accessTokenSessionPatterns = [
  /jwt (?:has )?expired/i,
  /invalid jwt/i,
];

/**
 * Returns true only when retrying with the current local auth state cannot
 * restore the session. Network, timeout, and server errors must remain
 * retryable so a temporary outage does not sign the caregiver out.
 */
export function isTerminalSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return terminalSessionMessages.some((candidate) => message.includes(candidate))
    || terminalSessionPatterns.some((pattern) => pattern.test(message));
}

export function isAccessTokenSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return accessTokenSessionPatterns.some((pattern) => pattern.test(message));
}

export async function loadWithAccessTokenRecovery<TSession, TResult>({
  session,
  load,
  refresh,
}: {
  session: TSession;
  load: (candidate: TSession) => Promise<TResult>;
  refresh: () => Promise<TSession | null>;
}) {
  try {
    return await load(session);
  } catch (error) {
    if (!isAccessTokenSessionError(error)) {
      throw error;
    }

    const refreshedSession = await refresh();
    if (!refreshedSession) {
      throw new Error("저장된 로그인 세션이 없어요. 다시 로그인해 주세요.");
    }

    return load(refreshedSession);
  }
}
