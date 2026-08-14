import assert from "node:assert/strict";
import test from "node:test";

import {
  findMostRecentRecord,
  formatSleepDuration,
  sleepMinutesForRecord,
  summarizeSleepMinutes,
} from "../src/features/shared/todayRecordSummary";

test("오늘 잠 기록은 종료 시각을 기준으로 합산한다", () => {
  const logs = [
    {
      value: "4시간 30분",
      recordedAt: "2026-08-13T00:30:00+09:00",
      recordedEndAt: "2026-08-13T05:00:00+09:00",
    },
    {
      value: "4시간 10분",
      recordedAt: "2026-08-13T13:20:00+09:00",
      recordedEndAt: "2026-08-13T17:30:00+09:00",
    },
  ];

  assert.equal(sleepMinutesForRecord(logs[0]), 270);
  assert.equal(summarizeSleepMinutes(logs), 520);
  assert.equal(formatSleepDuration(summarizeSleepMinutes(logs)), "8시간 40분");
});

test("오늘 체온은 오늘 기록 중 가장 최근 값을 선택한다", () => {
  const logs = [
    { type: "TEMPERATURE" as const, recordedAt: "2026-08-13T09:10:00+09:00", value: "36.8°C" },
    { type: "TEMPERATURE" as const, recordedAt: "2026-08-13T16:40:00+09:00", value: "37.2°C" },
    { type: "DIAPER" as const, recordedAt: "2026-08-13T17:00:00+09:00", value: "정상" },
  ];

  assert.equal(findMostRecentRecord(logs, "TEMPERATURE")?.value, "37.2°C");
});
