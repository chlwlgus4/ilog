import assert from "node:assert/strict";
import test from "node:test";

import {
  createRecordAlarmNotificationContent,
  recordAlarmLabel,
  secondsUntilRecordAlarm,
} from "../src/serverless/recordAlarmNotification";

test("기록 종류별 알림 제목과 이동 경로를 일관되게 만든다", () => {
  const cases = [
    ["FEEDING", "맘마", "/feeding-add"],
    ["SLEEP", "잠", "/sleep-add"],
    ["DIAPER", "기저귀", "/diaper-add"],
    ["TEMPERATURE", "체온", "/temperature-add"],
    ["MEDICINE", "약/영양제", "/medicine-add"],
    ["PUMPING", "유축", "/pumping-add"],
    ["MEMO", "메모", "/memo-add"],
    ["GROWTH", "성장", "/growth-add"],
    ["MOMENT", "순간", "/quick-add"],
    ["CHECKLIST", "할 일", "/quick-add"],
  ] as const;

  for (const [logType, label, route] of cases) {
    assert.equal(recordAlarmLabel(logType), label);
    assert.deepEqual(createRecordAlarmNotificationContent({ logType }), {
      title: `${label} 기록 알림`,
      body: `${label} 기록할 시간이에요.`,
      data: { kind: "record-alarm", logType, route },
      sound: "default",
    });
  }
});

test("기록 값은 공백을 제외하고 알림 본문에만 추가한다", () => {
  assert.equal(
    createRecordAlarmNotificationContent({ logType: "FEEDING", recordValue: "  180 ml  " }).body,
    "맘마 기록할 시간이에요. (180 ml)",
  );
  assert.equal(
    createRecordAlarmNotificationContent({ logType: "FEEDING", recordValue: "   " }).body,
    "맘마 기록할 시간이에요.",
  );
});

test("리마인더는 기록 시각을 기준으로 계산하되 즉시 반복을 막기 위해 최소 60초 뒤에 예약한다", () => {
  const now = Date.parse("2026-07-24T00:00:00.000Z");

  assert.equal(secondsUntilRecordAlarm("2026-07-24T00:00:00.000Z", 15, now), 900);
  assert.equal(secondsUntilRecordAlarm("2026-07-23T23:00:00.000Z", 15, now), 60);
  assert.equal(secondsUntilRecordAlarm("not-a-date", 1, now), 60);
});
