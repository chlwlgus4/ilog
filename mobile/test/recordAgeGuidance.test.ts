import assert from "node:assert/strict";
import test from "node:test";

import { getRecordAgeGuidance } from "../src/features/shared/recordAgeGuidance";

test("생후 첫 달 분유 수유에는 30-60ml 참고량을 표시한다", () => {
  const guidance = getRecordAgeGuidance({
    category: "FEEDING",
    birthDate: "2026-07-01",
    feedingMethod: "분유",
    referenceDate: new Date(2026, 6, 20),
  });

  assert.match(guidance.headline, /30-60ml/);
  assert.match(guidance.detail, /아기 반응/);
});

test("생후 4-12개월 수면에는 낮잠을 포함한 일일 수면 참고값을 표시한다", () => {
  const guidance = getRecordAgeGuidance({
    category: "SLEEP",
    birthDate: "2025-11-01",
    referenceDate: new Date(2026, 6, 20),
  });

  assert.match(guidance.headline, /12-16시간/);
});

test("생후 3개월 이하 체온 기록에는 의료진 상담 기준을 표시한다", () => {
  const guidance = getRecordAgeGuidance({
    category: "TEMPERATURE",
    birthDate: "2026-06-01",
    referenceDate: new Date(2026, 6, 20),
  });

  assert.match(guidance.headline, /38\.0/);
  assert.match(guidance.detail, /의료진/);
});

test("복약 기록에는 개월수 기반 용량을 제시하지 않는다", () => {
  const guidance = getRecordAgeGuidance({
    category: "MEDICINE",
    birthDate: "2025-07-01",
    referenceDate: new Date(2026, 6, 20),
  });

  assert.match(guidance.headline, /체중과 약 성분/);
  assert.match(guidance.detail, /처방전/);
});
