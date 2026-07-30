const loginFailureWindowMs = 15 * 60 * 1000;
const loginFailureThreshold = 5;
const initialLockMs = 30 * 1000;
const maxLockMs = 5 * 60 * 1000;

type LoginAttemptState = {
  failures: number;
  lockCount: number;
  lockedUntil: number;
  lastFailureAt: number;
};

export type LoginAttemptStatus = {
  allowed: boolean;
  remainingMs: number;
};

const loginAttempts = new Map<string, LoginAttemptState>();

function keyForEmail(email: string) {
  return email.trim().toLowerCase();
}

function activeState(email: string, now: number) {
  const key = keyForEmail(email);
  const state = loginAttempts.get(key);

  if (!state) {
    return null;
  }

  if (now - state.lastFailureAt > loginFailureWindowMs) {
    loginAttempts.delete(key);
    return null;
  }

  return state;
}

export function getLoginAttemptStatus(email: string, now = Date.now()): LoginAttemptStatus {
  const state = activeState(email, now);
  const remainingMs = state ? Math.max(0, state.lockedUntil - now) : 0;

  return {
    allowed: remainingMs === 0,
    remainingMs,
  };
}

export function recordInvalidLoginAttempt(email: string, now = Date.now()): LoginAttemptStatus {
  const key = keyForEmail(email);
  const previous = activeState(email, now);
  const state: LoginAttemptState = previous ?? {
    failures: 0,
    lockCount: 0,
    lockedUntil: 0,
    lastFailureAt: now,
  };

  state.failures += 1;
  state.lastFailureAt = now;

  if (state.failures >= loginFailureThreshold) {
    state.lockCount += 1;
    state.lockedUntil = now + Math.min(initialLockMs * 2 ** (state.lockCount - 1), maxLockMs);
  }

  loginAttempts.set(key, state);
  return getLoginAttemptStatus(email, now);
}

export function clearLoginAttempts(email: string) {
  loginAttempts.delete(keyForEmail(email));
}

export function isInvalidLoginError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Invalid login credentials") ||
    message.includes("이메일 또는 비밀번호가 맞지 않습니다")
  );
}

export function loginLockMessage(remainingMs: number) {
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `로그인을 여러 번 실패했어요. ${remainingSeconds}초 후 다시 시도해 주세요.`;
}

export function resetLoginAttemptsForTest() {
  loginAttempts.clear();
}
