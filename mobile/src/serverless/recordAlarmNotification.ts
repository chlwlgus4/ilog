import type { LogType } from "../api";
import { recordAlarmRoute } from "../notifications/notificationNavigation";

export const recordAlarmChannelId = "record-reminders";

export function secondsUntilRecordAlarm(
  recordedAt: string,
  intervalMinutes: number,
  now = Date.now(),
) {
  const recordedAtTime = Date.parse(recordedAt);
  const baseTime = Number.isNaN(recordedAtTime) ? now : recordedAtTime;
  const scheduledAt = baseTime + intervalMinutes * 60_000;

  return Math.max(Math.round((scheduledAt - now) / 1000), 60);
}

export function recordAlarmLabel(logType: LogType) {
  switch (logType) {
    case "FEEDING":
      return "맘마";
    case "SLEEP":
      return "잠";
    case "DIAPER":
      return "기저귀";
    case "TEMPERATURE":
      return "체온";
    case "MEDICINE":
      return "약/영양제";
    case "PUMPING":
      return "유축";
    case "MEMO":
      return "메모";
    case "GROWTH":
      return "성장";
    case "MOMENT":
      return "순간";
    case "CHECKLIST":
      return "할 일";
  }
}

export function createRecordAlarmNotificationContent({
  logType,
  recordValue,
}: {
  logType: LogType;
  recordValue?: string | null;
}) {
  const label = recordAlarmLabel(logType);
  const trimmedValue = recordValue?.trim();

  return {
    title: `${label} 기록 알림`,
    body: trimmedValue ? `${label} 기록할 시간이에요. (${trimmedValue})` : `${label} 기록할 시간이에요.`,
    data: { kind: "record-alarm", logType, route: recordAlarmRoute(logType) },
    sound: "default" as const,
  };
}
