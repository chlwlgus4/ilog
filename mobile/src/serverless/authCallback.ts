export interface AuthCallbackParams {
  inviteCode: string | null;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

function searchParamsFrom(value: string) {
  return new URLSearchParams(value.startsWith("?") || value.startsWith("#") ? value.slice(1) : value);
}

function normalizeInviteCode(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.toUpperCase() : null;
}

export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const queryEnd = hashIndex >= 0 ? hashIndex : url.length;
  const query = queryIndex >= 0 ? url.slice(queryIndex, queryEnd) : "";
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const queryParams = searchParamsFrom(query);
  const hashParams = searchParamsFrom(hash);
  const read = (key: string) => hashParams.get(key) ?? queryParams.get(key);

  return {
    inviteCode: normalizeInviteCode(queryParams.get("invite_code") ?? hashParams.get("invite_code")),
    code: read("code"),
    accessToken: read("access_token"),
    refreshToken: read("refresh_token"),
    type: read("type"),
    errorCode: read("error_code") ?? read("error"),
    errorDescription: read("error_description"),
  };
}

export function hasAuthCallbackCredentials(params: AuthCallbackParams) {
  return Boolean(
    params.code ||
      (params.accessToken && params.refreshToken),
  );
}

export function authCallbackErrorMessage(params: AuthCallbackParams) {
  const errorText = `${params.errorCode ?? ""} ${params.errorDescription ?? ""}`.toLowerCase();

  if (
    errorText.includes("otp_expired") ||
    errorText.includes("expired") ||
    errorText.includes("one-time token") ||
    errorText.includes("invalid link") ||
    errorText.includes("link is invalid")
  ) {
    return "인증 링크가 만료되었거나 이미 사용되었어요. 새 메일을 요청해 다시 시도해 주세요.";
  }

  if (errorText.includes("access_denied")) {
    return "인증이 취소되었거나 허용되지 않았어요. 다시 시도해 주세요.";
  }

  return "인증을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
}
