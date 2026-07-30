const appScheme = "ilog";

export function buildAppAuthRedirectUrl(path: string, inviteCode?: string | null) {
  const normalizedPath = path.replace(/^\/+/, "");
  const normalizedInviteCode = inviteCode?.trim().toUpperCase() ?? "";
  const inviteQuery = normalizedInviteCode
    ? `?invite_code=${encodeURIComponent(normalizedInviteCode)}`
    : "";

  return `${appScheme}://${normalizedPath}${inviteQuery}`;
}
