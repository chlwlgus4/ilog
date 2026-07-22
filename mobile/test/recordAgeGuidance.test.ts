import assert from "node:assert/strict";
import test from "node:test";

import { getRecordAgeGuidance } from "../src/features/shared/recordAgeGuidance";
import {
  feedingAgeGuidanceRuleSets,
  recordAgeGuidanceRuleSets,
  resolveAgeGuidanceRule,
} from "../src/features/shared/recordAgeGuidanceData";

test("최소 개월수 규칙은 해당 월령 이하에서 가장 가까운 규칙을 선택한다", () => {
  const fiveMonths = resolveAgeGuidanceRule(feedingAgeGuidanceRuleSets.FORMULA, 5);
  const sixMonths = resolveAgeGuidanceRule(feedingAgeGuidanceRuleSets.FORMULA, 6);

  assert.match(fiveMonths.headline, /주식/);
  assert.match(sixMonths.headline, /180-240 ml/);
});

test("생후 첫 달 분유 안내에는 첫 주와 첫 달 말 참고량을 함께 표시한다", () => {
  const guidance = getRecordAgeGuidance({
    category: "FEEDING",
    birthDate: "2026-07-01",
    feedingMethod: "분유",
    referenceDate: new Date(2026, 6, 20),
  });

  assert.match(guidance.headline, /첫 달/);
  assert.match(guidance.detail, /30-60 ml/);
  assert.match(guidance.detail, /90-120 ml/);
});

test("등록된 5kg 영아의 분유 안내에는 체중 기반 하루 평균 참고량을 표시한다", () => {
  const guidance = getRecordAgeGuidance({
    category: "FEEDING",
    birthDate: "2026-05-20",
    feedingMethod: "FORMULA",
    gender: "FEMALE",
    weightKg: 5,
    referenceDate: new Date(2026, 6, 20),
  });

  assert.equal(guidance.eyebrow, "생후 2개월 · 여아 · 최근 5kg 맞춤 안내");
  assert.match(guidance.detail, /하루 약 830 ml 안팎/);
});

test("체중 환산량이 일반 상한을 넘으면 960ml 범위를 별도로 안내한다", () => {
  const guidance = getRecordAgeGuidance({
    category: "FEEDING",
    birthDate: "2026-01-20",
    feedingMethod: "분유",
    weightKg: 8,
    referenceDate: new Date(2026, 6, 20),
  });

  assert.match(guidance.detail, /몸무게만으로 계산하면 하루 약 1320 ml/);
  assert.match(guidance.detail, /하루 총량은 960 ml 안에서/);
});

test("직수와 이유식은 몸무게만으로 시간이나 섭취량을 환산하지 않는다", () => {
  const breast = getRecordAgeGuidance({
    category: "FEEDING",
    birthDate: "2026-01-20",
    feedingMethod: "모유(직수)",
    weightKg: 7.2,
    referenceDate: new Date(2026, 6, 20),
  });
  const solid = getRecordAgeGuidance({
    category: "FEEDING",
    birthDate: "2026-01-20",
    feedingMethod: "이유식",
    weightKg: 7.2,
    referenceDate: new Date(2026, 6, 20),
  });

  assert.match(breast.detail, /몸무게로 먹는 시간이나 양을 정하지 않아요/);
  assert.match(solid.detail, /몸무게만으로 정하지 않고/);
});

test("생후 4-12개월 잠에는 낮잠을 포함한 일일 잠 참고값을 표시한다", () => {
  const guidance = getRecordAgeGuidance({
    category: "SLEEP",
    birthDate: "2025-11-01",
    referenceDate: new Date(2026, 6, 20),
  });

  assert.match(guidance.headline, /12-16시간/);
});

test("생후 3개월 미만 체온 기록에는 의료진 상담 기준을 표시한다", () => {
  const guidance = getRecordAgeGuidance({
    category: "TEMPERATURE",
    birthDate: "2026-06-01",
    referenceDate: new Date(2026, 6, 20),
  });

  assert.match(guidance.headline, /38\.0/);
  assert.match(guidance.headline, /의료진/);
});

test("복약 기록은 개월수 기반 용량 대신 등록 몸무게를 확인 정보로 사용한다", () => {
  const guidance = getRecordAgeGuidance({
    category: "MEDICINE",
    birthDate: "2025-07-01",
    weightKg: 9.4,
    referenceDate: new Date(2026, 6, 20),
  });

  assert.match(guidance.headline, /약 성분과 농도/);
  assert.match(guidance.detail, /최근 몸무게 9\.4kg/);
  assert.doesNotMatch(guidance.detail, /\d+\s*(?:mg|ml)\/kg/);
});

test("성장 안내에는 등록 성별과 최신 몸무게·키를 기준으로 표시한다", () => {
  const guidance = getRecordAgeGuidance({
    category: "GROWTH",
    birthDate: "2025-07-01",
    gender: "MALE",
    weightKg: 9.4,
    heightCm: 75.2,
    referenceDate: new Date(2026, 6, 20),
  });

  assert.equal(guidance.eyebrow, "생후 12개월 · 남아 · 최근 9.4kg · 75.2cm 맞춤 안내");
  assert.match(guidance.detail, /남아 성장표/);
});

test("모든 맞춤 팁은 일반 사용자에게 낯선 참고값 표현을 사용하지 않는다", () => {
  const allCopies = [
    ...Object.values(feedingAgeGuidanceRuleSets),
    ...Object.values(recordAgeGuidanceRuleSets),
  ].flatMap((ruleSet) => [ruleSet.withoutBirthDate, ...ruleSet.rules]);

  for (const copy of allCopies) {
    assert.doesNotMatch(`${copy.headline} ${copy.detail}`, /일반 참고값|참고값|발열 참고 기준/);
  }

  const guidance = getRecordAgeGuidance({
    category: "SLEEP",
    birthDate: "2026-01-01",
    referenceDate: new Date(2026, 6, 20),
  });
  assert.doesNotMatch(guidance.caution, /일반 참고값|참고값/);
});
