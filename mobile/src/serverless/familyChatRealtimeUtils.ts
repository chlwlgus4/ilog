export type FamilyChatRealtimeInsertRow = {
  id: number;
  family_id: number;
  sender_caregiver_id: number;
};

export function familyChatRealtimeFilter(familyId: number) {
  return `family_id=eq.${familyId}`;
}

export function parseFamilyChatRealtimeInsert(
  familyId: number,
  value: unknown,
): FamilyChatRealtimeInsertRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Partial<FamilyChatRealtimeInsertRow>;
  if (
    !Number.isSafeInteger(row.id)
    || !Number.isSafeInteger(row.family_id)
    || !Number.isSafeInteger(row.sender_caregiver_id)
    || row.family_id !== familyId
  ) {
    return null;
  }

  return row as FamilyChatRealtimeInsertRow;
}
