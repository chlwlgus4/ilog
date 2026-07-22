import type {
  CaregiverRole,
  ChatMessageType,
  ChildGender,
  ChildStage,
  LogType,
  NotificationTone,
  ScheduleCategory,
  TaskPriority,
  TaskStatus,
} from "./api";

export const childGenderLabel: Record<ChildGender, string> = {
  MALE: "남아",
  FEMALE: "여아",
};

export const roleLabel: Record<CaregiverRole, string> = {
  MOM: "엄마",
  DAD: "아빠",
  GUARDIAN: "보호자",
};

export const caregiverRoleOptions = ["MOM", "DAD", "GUARDIAN"] as const satisfies readonly CaregiverRole[];

export const roleDefaultNickname: Record<CaregiverRole, string> = {
  MOM: "엄마",
  DAD: "아빠",
  GUARDIAN: "보호자",
};

export function nicknameForRoleChange(
  currentNickname: string,
  currentRole: CaregiverRole,
  nextRole: CaregiverRole,
) {
  const trimmedNickname = currentNickname.trim();

  if (!trimmedNickname || trimmedNickname === roleDefaultNickname[currentRole]) {
    return roleDefaultNickname[nextRole];
  }

  return currentNickname;
}

export const priorityLabel: Record<TaskPriority, string> = {
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

export const statusLabel: Record<TaskStatus, string> = {
  PENDING: "대기",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
};

export const logTypeLabel: Record<LogType, string> = {
  FEEDING: "맘마",
  SLEEP: "잠",
  GROWTH: "성장",
  MOMENT: "메모",
  MEDICINE: "복약",
  CHECKLIST: "체크리스트",
  DIAPER: "기저귀",
  TEMPERATURE: "체온",
  PUMPING: "유축",
  MEMO: "메모",
};

export const stageLabel: Record<ChildStage, string> = {
  NEWBORN: "신생아",
  INFANT: "영아",
  TODDLER: "유아",
  PRESCHOOL: "취학 전",
  EARLY_SCHOOL: "초등 저학년",
};

export const scheduleLabel: Record<ScheduleCategory, string> = {
  HOSPITAL: "병원",
  VACCINE: "예방접종",
  DAYCARE: "어린이집",
  SCHOOL: "학교",
  HOME: "집",
  ACTIVITY: "활동",
};

export const chatTypeLabel: Record<ChatMessageType, string> = {
  TEXT: "메시지",
  TASK_LINK: "할 일 공유",
  LOG_UPDATE: "기록 공유",
};

export const toneLabel: Record<NotificationTone, string> = {
  warning: "주의",
  info: "안내",
  positive: "좋아요",
  muted: "참고",
};

export function missingSupabaseConfigMessage() {
  return "서버 연결 설정을 불러오지 못했어요. 앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.";
}

export function toDateTimeValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatShortTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function reminderLabel(value: number | null | undefined) {
  if (value == null) {
    return "리마인더 없음";
  }

  if (value < 60) {
    return `${value}분 전`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}시간 전` : `${hours}시간 ${minutes}분 전`;
}
