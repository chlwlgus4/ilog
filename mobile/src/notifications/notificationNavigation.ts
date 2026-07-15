import type { LogType } from "../api";

export type NotificationRoute =
  | "/home"
  | "/timeline"
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
  | "/notifications";

const allowedRoutes = new Set<NotificationRoute>([
  "/home",
  "/timeline",
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
]);

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

export function resolveNotificationRoute(data: unknown): NotificationRoute {
  const payload = asRecord(data);

  if (hasValue(payload.taskId)) {
    return "/task-assignments";
  }

  const recordType = readUppercaseString(payload.recordType);
  if (recordType === "VACCINATION") {
    return "/vaccinations";
  }
  if (recordType === "HOSPITAL") {
    return "/hospital-visits";
  }
  if (recordType === "GROWTH") {
    return "/growth";
  }
  if (recordType) {
    return "/timeline";
  }

  const logType = readLogType(payload.logType);
  if (payload.kind === "record-alarm" || hasValue(payload.recordAlarmScheduleId) || logType) {
    return logType ? recordAlarmRoute(logType) : "/quick-add";
  }

  if (hasValue(payload.familyChatMessageId)) {
    return "/family-chat";
  }

  if (hasValue(payload.chatMessageId)) {
    return "/timeline";
  }

  const route = payload.route;
  return typeof route === "string" && allowedRoutes.has(route as NotificationRoute) ? (route as NotificationRoute) : "/notifications";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function hasValue(value: unknown) {
  return typeof value === "number" || (typeof value === "string" && value.trim() !== "");
}

function readUppercaseString(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : null;
}

function readLogType(value: unknown): LogType | null {
  const normalized = readUppercaseString(value);
  return normalized && normalized in recordAlarmRoutes ? (normalized as LogType) : null;
}
