export const safetyTargetTypes = [
  "FAMILY_CHAT_MESSAGE", "CHAT_MESSAGE", "TIMELINE_COMMENT", "FAMILY_PHOTO",
  "LOG", "GROWTH_MEASUREMENT", "VACCINATION_RECORD", "HOSPITAL_VISIT",
  "MEMORY_ENTRY", "TASK", "SCHEDULE", "CAREGIVER", "RECORD_ATTACHMENT",
] as const;

export type SafetyTargetType = (typeof safetyTargetTypes)[number];
export type SafetyTarget = {
  type: SafetyTargetType;
  id: number;
  caregiverId?: number | null;
  displayName?: string | null;
};
export const safetyReportReasons = [
  { value: "CHILD_SAFETY", label: "아동 안전 위협" },
  { value: "HARASSMENT", label: "괴롭힘·혐오·위협" },
  { value: "SEXUAL_CONTENT", label: "성적·부적절한 콘텐츠" },
  { value: "VIOLENCE", label: "폭력·불법 행위" },
  { value: "SPAM", label: "스팸·광고" },
  { value: "PRIVACY", label: "개인정보·권리 침해" },
  { value: "OTHER", label: "기타" },
] as const;
export type SafetyReportReason = (typeof safetyReportReasons)[number]["value"];
export type HiddenSafetyTarget = { target_type: SafetyTargetType; target_id: number };
export type ContentSafetyData = {
  blockedCaregiverIds: number[];
  hiddenTargets: HiddenSafetyTarget[];
};

export function isSafetyTargetHidden(state: ContentSafetyData, type: SafetyTargetType, id: number) {
  return state.hiddenTargets.some((target) => target.target_type === type && target.target_id === id);
}

export function isCommunicationAuthorHidden(state: ContentSafetyData, caregiverId?: number | null) {
  return caregiverId != null && (
    state.blockedCaregiverIds.includes(caregiverId)
    || isSafetyTargetHidden(state, "CAREGIVER", caregiverId)
  );
}

export function filterSafetyComments<T extends { id: number; authorId?: number | null; replies: T[] }>(state: ContentSafetyData, comments: T[]): T[] {
  return comments.flatMap((comment) => {
    // Match the server's parent-visible rule. This hides the thread, never deletes replies.
    if (isSafetyTargetHidden(state, "TIMELINE_COMMENT", comment.id) || isCommunicationAuthorHidden(state, comment.authorId)) return [];
    const replies = filterSafetyComments(state, comment.replies);
    return [{ ...comment, replies }];
  });
}

export function validateSafetyReport(reason: SafetyReportReason | null, details: string) {
  if (!reason) return "신고 사유를 선택해 주세요.";
  const trimmed = details.trim();
  if (trimmed.length > 1000) return "설명은 1,000자 이내로 입력해 주세요.";
  if (reason === "OTHER" && trimmed.length < 10) return "기타 사유는 10자 이상 설명해 주세요.";
  return null;
}

export function contentSafetyErrorMessage(error: unknown, fallback = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.") {
  const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error ?? "");
  const messages: Record<string, string> = {
    CONTENT_SAFETY_FILTERED: "부적절한 표현이 포함되어 저장할 수 없어요. 내용을 확인해 주세요.",
    CONTENT_SAFETY_USER_RESTRICTED: "안전 정책에 따라 현재 콘텐츠 작성이 제한된 계정이에요. 고객지원에 문의해 주세요.",
    CONTENT_SAFETY_AUTH_REQUIRED: "로그인 상태를 확인한 뒤 다시 시도해 주세요.",
    AUTH_REQUIRED: "로그인 상태를 확인한 뒤 다시 시도해 주세요.",
    CAREGIVER_CONTACT_BLOCKED: "차단 설정으로 이 보호자와 대화·댓글·태그를 주고받을 수 없어요.",
    CONTENT_SAFETY_RATE_LIMITED: "요청이 잠시 많아졌어요. 조금 뒤 다시 시도해 주세요.",
    CONTENT_SAFETY_TARGET_NOT_FOUND: "이미 삭제되었거나 접근할 수 없는 항목이에요. 목록을 새로고침해 주세요.",
    CONTENT_SAFETY_SELF_REPORT: "내 계정이나 내가 작성한 콘텐츠는 신고할 수 없어요.",
    CONTENT_SAFETY_INVALID_INPUT: "신고 대상과 입력 내용을 다시 확인해 주세요.",
  };
  for (const [code, text] of Object.entries(messages)) {
    if (message.includes(code)) return text;
  }
  if (/Timeline item was not found|Parent comment was not found/.test(message)) return "대화나 댓글이 삭제되었거나 신고·차단 설정으로 접근할 수 없어요. 목록을 새로고침해 주세요.";
  return fallback;
}
