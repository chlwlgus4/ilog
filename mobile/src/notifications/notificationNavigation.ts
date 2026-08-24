import type { LogType, RecordDetailSource } from "../api";

export type NotificationRoute =
  | "/home"
  | "/timeline"
  | "/timeline-detail"
  | "/task-assignments"
  | "/feeding-add"
  | "/sleep-add"
  | "/diaper-add"
  | "/temperature-add"
  | "/medicine-add"
  | "/pumping-add"
  | "/memo-add"
  | "/growth"
  | "/growth-add"
  | "/vaccinations"
  | "/hospital-visits"
  | "/family-chat"
  | "/quick-add"
  | "/notifications"
  | "/settings";

export type NotificationDestination = {
  pathname: NotificationRoute;
  params?: Record<string, string>;
};

const allowedRoutes = new Set<NotificationRoute>([
  "/home",
  "/timeline",
  "/timeline-detail",
  "/task-assignments",
  "/feeding-add",
  "/sleep-add",
  "/diaper-add",
  "/temperature-add",
  "/medicine-add",
  "/pumping-add",
  "/memo-add",
  "/growth",
  "/growth-add",
  "/vaccinations",
  "/hospital-visits",
  "/family-chat",
  "/quick-add",
  "/notifications",
  "/settings",
]);

const logTypes = new Set<LogType>([
  "FEEDING",
  "SLEEP",
  "GROWTH",
  "MOMENT",
  "MEDICINE",
  "CHECKLIST",
  "DIAPER",
  "TEMPERATURE",
  "PUMPING",
  "MEMO",
]);

type NotificationRecordType = LogType | "VACCINATION" | "HOSPITAL";

const notificationRecordTypes = new Set<NotificationRecordType>([
  "FEEDING",
  "SLEEP",
  "GROWTH",
  "MOMENT",
  "MEDICINE",
  "CHECKLIST",
  "DIAPER",
  "TEMPERATURE",
  "PUMPING",
  "MEMO",
  "VACCINATION",
  "HOSPITAL",
]);

const recordDetailSources = new Set<RecordDetailSource>(["LOG", "GROWTH_MEASUREMENT"]);

const recordAlarmRoutes: Partial<Record<LogType, NotificationRoute>> = {
  FEEDING: "/feeding-add",
  SLEEP: "/sleep-add",
  DIAPER: "/diaper-add",
  TEMPERATURE: "/temperature-add",
  MEDICINE: "/medicine-add",
  PUMPING: "/pumping-add",
  MEMO: "/memo-add",
  GROWTH: "/growth-add",
};

export function recordAlarmRoute(logType: LogType): NotificationRoute {
  return recordAlarmRoutes[logType] ?? "/quick-add";
}

export function resolveNotificationDestination(data: unknown): NotificationDestination {
  const payload = asRecord(data);
  const taskId = readPositiveSafeInteger(payload.taskId);

  if (taskId !== null) {
    return {
      pathname: "/task-assignments",
      params: { taskId: String(taskId) },
    };
  }

  const recordType = readRecordType(payload.recordType);
  const recordId = readPositiveSafeInteger(payload.recordId);
  if (recordType && recordId !== null) {
    const recordSource = readRecordSource(payload.recordSource);
    return {
      pathname: "/timeline-detail",
      params: {
        recordType,
        recordId: String(recordId),
        ...(recordSource ? { recordSource } : {}),
      },
    };
  }

  if (recordType) {
    return { pathname: legacyRecordRoute(recordType) };
  }

  const logType = readLogType(payload.logType);
  const recordAlarmScheduleId = readPositiveSafeInteger(payload.recordAlarmScheduleId);
  const sourceLogId = readPositiveSafeInteger(payload.sourceLogId);
  if (payload.kind === "record-alarm" || recordAlarmScheduleId !== null || logType) {
    const params: Record<string, string> = {};
    if (recordAlarmScheduleId !== null) {
      params.recordAlarmScheduleId = String(recordAlarmScheduleId);
    }
    if (sourceLogId !== null) {
      params.sourceLogId = String(sourceLogId);
    }

    return withOptionalParams(logType ? recordAlarmRoute(logType) : "/quick-add", params);
  }

  const familyChatMessageId = readPositiveSafeInteger(payload.familyChatMessageId);
  if (familyChatMessageId !== null) {
    return {
      pathname: "/family-chat",
      params: { familyChatMessageId: String(familyChatMessageId) },
    };
  }

  const chatMessageId = readPositiveSafeInteger(payload.chatMessageId);
  if (chatMessageId !== null) {
    const params: Record<string, string> = { chatMessageId: String(chatMessageId) };
    const commentId = readPositiveSafeInteger(payload.commentId);
    const parentCommentId = readPositiveSafeInteger(payload.parentCommentId);
    if (commentId !== null) {
      params.commentId = String(commentId);
    }
    if (parentCommentId !== null) {
      params.parentCommentId = String(parentCommentId);
    }

    return { pathname: "/timeline", params };
  }

  const route = payload.route;
  return {
    pathname:
      typeof route === "string" && allowedRoutes.has(route as NotificationRoute)
        ? (route as NotificationRoute)
        : "/notifications",
  };
}

export function resolveNotificationRoute(data: unknown): NotificationRoute {
  return resolveNotificationDestination(data).pathname;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readUppercaseString(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : null;
}

function readLogType(value: unknown): LogType | null {
  const normalized = readUppercaseString(value);
  return normalized && logTypes.has(normalized as LogType) ? (normalized as LogType) : null;
}

function readRecordType(value: unknown): NotificationRecordType | null {
  const normalized = readUppercaseString(value);
  return normalized && notificationRecordTypes.has(normalized as NotificationRecordType)
    ? (normalized as NotificationRecordType)
    : null;
}

function readRecordSource(value: unknown): RecordDetailSource | null {
  const normalized = readUppercaseString(value);
  return normalized && recordDetailSources.has(normalized as RecordDetailSource)
    ? (normalized as RecordDetailSource)
    : null;
}

function readPositiveSafeInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function legacyRecordRoute(recordType: NotificationRecordType): NotificationRoute {
  if (recordType === "VACCINATION") {
    return "/vaccinations";
  }
  if (recordType === "HOSPITAL") {
    return "/hospital-visits";
  }
  if (recordType === "GROWTH") {
    return "/growth";
  }
  return "/timeline";
}

function withOptionalParams(
  pathname: NotificationRoute,
  params: Record<string, string>,
): NotificationDestination {
  return Object.keys(params).length > 0 ? { pathname, params } : { pathname };
}
