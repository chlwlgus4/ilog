import type { LogCard, LogType } from "../../api";

type TimestampedLog = Pick<LogCard, "type" | "recordedAt">;
type SleepLog = Pick<LogCard, "value" | "recordedAt" | "recordedEndAt">;

export function findMostRecentRecord<T extends TimestampedLog>(logs: readonly T[], type: LogType) {
  return logs.reduce<T | null>((latest, log) => {
    if (log.type !== type) {
      return latest;
    }

    if (!latest) {
      return log;
    }

    const recordedAt = Date.parse(log.recordedAt);
    const latestRecordedAt = Date.parse(latest.recordedAt);

    if (Number.isFinite(recordedAt) && (!Number.isFinite(latestRecordedAt) || recordedAt > latestRecordedAt)) {
      return log;
    }

    return latest;
  }, null);
}

export function summarizeSleepMinutes<T extends SleepLog>(logs: readonly T[]) {
  return logs.reduce((total, log) => total + sleepMinutesForRecord(log), 0);
}

export function sleepMinutesForRecord(log: SleepLog) {
  if (log.recordedEndAt) {
    const startedAt = Date.parse(log.recordedAt);
    const endedAt = Date.parse(log.recordedEndAt);

    if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt > startedAt) {
      return Math.round((endedAt - startedAt) / 60_000);
    }
  }

  const hourMatch = log.value.match(/(\d+(?:\.\d+)?)\s*시간/);
  const minuteMatch = log.value.match(/(\d+(?:\.\d+)?)\s*분/);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const duration = hours * 60 + minutes;

  if (duration > 0) {
    return duration;
  }

  const numericValue = Number(log.value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function formatSleepDuration(totalMinutes: number) {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}시간 ${minutes}분`;
  }

  if (hours > 0) {
    return `${hours}시간`;
  }

  return `${minutes}분`;
}
