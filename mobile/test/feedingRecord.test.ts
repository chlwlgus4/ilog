import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeedingRecordData,
  feedingMetricForLog,
  summarizeFeedingLogs,
} from "../src/features/shared/feedingRecord";

test("분유는 ml, 직수는 시간과 방향, 이유식은 g과 식재료로 저장한다", () => {
  assert.deepEqual(buildFeedingRecordData({ method: "FORMULA", measurement: "120" }), {
    value: "120 ml",
    recordSubtype: "분유",
    details: { feedingMethod: "FORMULA", method: "분유", unit: "ml", amountMl: 120 },
  });
  assert.deepEqual(buildFeedingRecordData({ method: "BREAST", measurement: "15", breastSide: "왼쪽" }), {
    value: "15분 · 왼쪽",
    recordSubtype: "모유",
    details: { feedingMethod: "BREAST", method: "모유", unit: "min", durationMinutes: 15, side: "왼쪽" },
  });
  assert.deepEqual(buildFeedingRecordData({ method: "SOLID", measurement: "80", foodName: "쌀미음" }), {
    value: "80 g · 쌀미음",
    recordSubtype: "이유식",
    details: { feedingMethod: "SOLID", method: "이유식", unit: "g", amountGrams: 80, foodName: "쌀미음" },
  });
});

test("직수 기록은 방향이 없으면 저장 데이터가 만들어지지 않는다", () => {
  assert.equal(buildFeedingRecordData({ method: "BREAST", measurement: "12" }), null);
});

test("과거 ml 기록도 분유 기록으로 읽는다", () => {
  assert.deepEqual(feedingMetricForLog({ value: "180 ml" }), {
    method: "FORMULA",
    methodLabel: "분유",
    unit: "ml",
    value: 180,
  });
});

test("맘마 통계는 최신 방법과 같은 단위의 기록만 합산한다", () => {
  const summary = summarizeFeedingLogs([
    { value: "120 ml", recordedAt: "2026-07-20T08:00:00+09:00" },
    { value: "15분 · 왼쪽", recordSubtype: "모유", recordedAt: "2026-07-20T10:00:00+09:00" },
    { value: "10분 · 오른쪽", details: { feedingMethod: "BREAST", durationMinutes: 10, unit: "min" }, recordedAt: "2026-07-20T12:00:00+09:00" },
    { value: "80 g · 쌀미음", recordSubtype: "이유식", recordedAt: "2026-07-20T09:00:00+09:00" },
  ]);

  assert.equal(summary?.method, "BREAST");
  assert.equal(summary?.total, 25);
  assert.equal(summary?.value, "모유(직수) 25 분");
  assert.equal(summary?.logs.length, 2);
});
