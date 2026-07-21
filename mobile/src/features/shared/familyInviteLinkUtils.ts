export function normalizeFamilyInviteCode(value: string | string[] | null | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue?.trim().toUpperCase() ?? "";
}

export function buildFamilyInviteUrl({
  inviteCode,
  inviteBaseUrl,
  fallbackUrl,
}: {
  inviteCode: string | string[] | null | undefined;
  inviteBaseUrl?: string | null;
  fallbackUrl: string;
}) {
  const normalizedInviteCode = normalizeFamilyInviteCode(inviteCode);
  const baseUrl = normalizeInviteBaseUrl(inviteBaseUrl);

  if (!baseUrl) {
    return appendInviteCode(fallbackUrl, normalizedInviteCode);
  }

  const url = new URL("invite", `${baseUrl}/`);
  url.searchParams.set("invite_code", normalizedInviteCode);
  return url.toString();
}

function normalizeInviteBaseUrl(value: string | null | undefined) {
  const rawValue = value?.trim();
  if (!rawValue) {
    return "";
  }

  try {
    const url = new URL(rawValue);
    if (url.protocol !== "https:") {
      return "";
    }

    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function appendInviteCode(urlValue: string, inviteCode: string) {
  try {
    const url = new URL(urlValue);
    url.searchParams.set("invite_code", inviteCode);
    return url.toString();
  } catch {
    const separator = urlValue.includes("?") ? "&" : "?";
    return `${urlValue}${separator}invite_code=${encodeURIComponent(inviteCode)}`;
  }
}
