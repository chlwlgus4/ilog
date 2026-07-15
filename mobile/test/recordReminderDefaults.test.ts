import assert from "node:assert/strict";
import test from "node:test";

import {
  configurableRecordReminderLogTypes,
  createDefaultRecordAlarmRule,
  missingDefaultRecordReminders,
} from "../src/features/shared/recordReminderDefaults";

test("새 기기 푸시 설정은 없는 카테고리 리마인더만 기본값으로 만든다", () => {
  const existingFeeding = createDefaultRecordAlarmRule(42, "FEEDING", false);
  existingFeeding.id = 9;
  existingFeeding.intervalMinutes = 75;

  const defaults = missingDefaultRecordReminders(42, [existingFeeding]);

  assert.equal(defaults.some((rule) => rule.logType === "FEEDING"), false);
  assert.equal(defaults.length, configurableRecordReminderLogTypes.length - 1);
  assert.equal(defaults.every((rule) => rule.familyId === 42 && rule.enabled && rule.id === null), true);
});

test("새 리마인더 기본 주기는 카테고리별 설정을 따른다", () => {
  const feeding = createDefaultRecordAlarmRule(7, "FEEDING", true);
  const medicine = createDefaultRecordAlarmRule(7, "MEDICINE", true);

  assert.equal(feeding.intervalMinutes, 180);
  assert.equal(medicine.intervalMinutes, 480);
  assert.equal(medicine.notifyScope, "FAMILY");
});
