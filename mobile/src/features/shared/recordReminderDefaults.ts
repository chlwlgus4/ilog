import type { LogType, RecordAlarmRuleCard } from "../../api";

export const recordAlarmRuleLogTypes: LogType[] = [
  "FEEDING",
  "SLEEP",
  "DIAPER",
  "TEMPERATURE",
  "MEDICINE",
  "PUMPING",
  "GROWTH",
  "MEMO",
];

export const configurableRecordReminderLogTypes: LogType[] = [
  "FEEDING",
  "SLEEP",
  "DIAPER",
  "TEMPERATURE",
  "MEDICINE",
  "PUMPING",
  "MEMO",
];

export const defaultRecordAlarmIntervals: Record<LogType, number> = {
  FEEDING: 180,
  SLEEP: 120,
  GROWTH: 10080,
  MOMENT: 180,
  MEDICINE: 480,
  CHECKLIST: 180,
  DIAPER: 240,
  TEMPERATURE: 30,
  PUMPING: 180,
  MEMO: 180,
};

export function createDefaultRecordAlarmRule(
  familyId: number,
  logType: LogType,
  enabled = false,
): RecordAlarmRuleCard {
  return {
    id: null,
    familyId,
    logType,
    enabled,
    intervalMinutes: defaultRecordAlarmIntervals[logType],
    notifyScope: "FAMILY",
    updatedAt: null,
  };
}

export function missingDefaultRecordReminders(
  familyId: number,
  rules: RecordAlarmRuleCard[],
): RecordAlarmRuleCard[] {
  const rulesByType = new Map(rules.map((rule) => [rule.logType, rule]));

  return configurableRecordReminderLogTypes
    .filter((logType) => rulesByType.get(logType)?.id == null)
    .map((logType) => createDefaultRecordAlarmRule(familyId, logType, true));
}
