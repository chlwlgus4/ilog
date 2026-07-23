export const duplicateFamilyNicknameMessage =
  "이미 가족이 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.";

export function duplicateNicknameErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("caregivers_family_name_ci_key") ||
    (normalizedMessage.includes("duplicate key") &&
      normalizedMessage.includes("caregiver") &&
      normalizedMessage.includes("name"))
  ) {
    return duplicateFamilyNicknameMessage;
  }

  return null;
}
