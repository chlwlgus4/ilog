import type { CaregiverSummary, FamilySummary } from "../../api";

export function canLeaveFamily(caregivers: CaregiverSummary[]) {
  return caregivers.length > 1;
}

export function isFamilyDeletionOwner(family: FamilySummary | null | undefined, caregiverId: number | null | undefined) {
  return Boolean(family && caregiverId && family.ownerCaregiverId === caregiverId);
}

export function formatFamilyDeletionDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
