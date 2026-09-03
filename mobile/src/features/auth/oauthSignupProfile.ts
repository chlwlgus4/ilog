import type { CaregiverRole } from "../../api";

export interface OAuthSignupProfile {
  caregiverName: string;
  role: CaregiverRole;
}

const caregiverRoles = new Set<CaregiverRole>(["MOM", "DAD", "GUARDIAN"]);

export function normalizeOAuthSignupProfile(
  value: Partial<OAuthSignupProfile> | null | undefined,
): OAuthSignupProfile | null {
  const caregiverName = typeof value?.caregiverName === "string" ? value.caregiverName.trim() : "";
  const role = value?.role;

  if (!caregiverName || !role || !caregiverRoles.has(role)) {
    return null;
  }

  return { caregiverName, role };
}
