import { childAgeInMonths } from "./childAge";
import { feedingMethodKeyForValue } from "./feedingRecord";
import {
  feedingAgeGuidanceRuleSets,
  recordAgeGuidanceRuleSets,
  resolveAgeGuidanceRule,
  type RecordAgeGuidanceCategory,
} from "./recordAgeGuidanceData";

export type { RecordAgeGuidanceCategory } from "./recordAgeGuidanceData";

export type RecordAgeGuidance = {
  eyebrow: string;
  headline: string;
  detail: string;
  caution: string;
};

type RecordAgeGuidanceInput = {
  category: RecordAgeGuidanceCategory;
  birthDate?: string | null;
  feedingMethod?: string | null;
  gender?: "MALE" | "FEMALE" | null;
  weightKg?: number | null;
  heightCm?: number | null;
  referenceDate?: Date;
};

const defaultCaution = "아이마다 성장 속도와 생활 리듬이 달라요. 평소와 다른 모습이 있거나 걱정되면 의료진과 상담해 주세요.";

export function getRecordAgeGuidance({
  category,
  birthDate,
  feedingMethod,
  gender,
  weightKg,
  heightCm,
  referenceDate,
}: RecordAgeGuidanceInput): RecordAgeGuidance {
  const ageMonths = childAgeInMonths(birthDate ?? "", referenceDate);
  const eyebrow = registeredChildBasisLabel({ ageMonths, gender, weightKg, heightCm });

  if (category === "FEEDING") {
    const method = feedingMethodKeyForValue(feedingMethod);

    if (!method) {
      return guidance(
        eyebrow,
        "먹인 방법을 먼저 골라 주세요.",
        "분유는 먹인 양, 모유(직수)는 먹인 시간과 방향, 이유식은 먹은 양과 메뉴를 남길 수 있어요.",
      );
    }

    const copy = resolveAgeGuidanceRule(feedingAgeGuidanceRuleSets[method], ageMonths);
    return guidance(
      eyebrow,
      copy.headline,
      personalizeDetail({ category, detail: copy.detail, ageMonths, feedingMethod: method, weightKg, heightCm, gender }),
    );
  }

  const copy = resolveAgeGuidanceRule(recordAgeGuidanceRuleSets[category], ageMonths);
  return guidance(
    eyebrow,
    copy.headline,
    personalizeDetail({ category, detail: copy.detail, ageMonths, weightKg, heightCm, gender }),
  );
}

function guidance(eyebrow: string, headline: string, detail: string): RecordAgeGuidance {
  return {
    eyebrow,
    headline,
    detail,
    caution: defaultCaution,
  };
}

function registeredChildBasisLabel({
  ageMonths,
  gender,
  weightKg,
  heightCm,
}: {
  ageMonths: number | null;
  gender?: "MALE" | "FEMALE" | null;
  weightKg?: number | null;
  heightCm?: number | null;
}) {
  const parts = [
    ageMonths === null ? "생년월일 미등록" : `생후 ${ageMonths}개월`,
    gender === "MALE" ? "남아" : gender === "FEMALE" ? "여아" : null,
    validMeasurement(weightKg) ? `최근 ${formatMeasurement(weightKg)}kg` : null,
    validMeasurement(heightCm) ? `${formatMeasurement(heightCm)}cm` : null,
  ].filter(Boolean);

  return `${parts.join(" · ")} 맞춤 안내`;
}

function personalizeDetail({
  category,
  detail,
  ageMonths,
  feedingMethod,
  weightKg,
  heightCm,
  gender,
}: {
  category: RecordAgeGuidanceCategory;
  detail: string;
  ageMonths: number | null;
  feedingMethod?: "FORMULA" | "BREAST" | "SOLID";
  weightKg?: number | null;
  heightCm?: number | null;
  gender?: "MALE" | "FEMALE" | null;
}) {
  if (category === "FEEDING" && feedingMethod === "FORMULA" && validMeasurement(weightKg) && ageMonths !== null && ageMonths < 12) {
    const estimatedDailyMl = Math.round((weightKg * 75 / 0.453) / 10) * 10;
    const weightBasedCopy = estimatedDailyMl > 960
      ? `몸무게만으로 계산하면 하루 약 ${estimatedDailyMl} ml이지만, 하루 총량은 960 ml 안에서 아이의 배고픔과 포만 신호에 맞춰 주세요.`
      : `최근 몸무게로 계산하면 하루 약 ${estimatedDailyMl} ml 안팎이에요.`;
    return `${detail} 최근 몸무게는 ${formatMeasurement(weightKg)}kg이에요. ${weightBasedCopy}`;
  }

  if (category === "FEEDING" && feedingMethod === "BREAST" && validMeasurement(weightKg)) {
    return `${detail} 최근 몸무게는 ${formatMeasurement(weightKg)}kg이에요. 모유(직수)는 몸무게로 먹는 시간이나 양을 정하지 않아요.`;
  }

  if (category === "FEEDING" && feedingMethod === "SOLID" && validMeasurement(weightKg)) {
    return `${detail} 최근 몸무게는 ${formatMeasurement(weightKg)}kg이에요. 이유식 양은 몸무게만으로 정하지 않고 먹는 모습과 반응에 맞춰 천천히 늘려 주세요.`;
  }

  if (category === "MEDICINE" && validMeasurement(weightKg)) {
    return `${detail} 약의 양을 확인할 때 최근 몸무게 ${formatMeasurement(weightKg)}kg을 의료진 또는 약사에게 알려주세요.`;
  }

  if (category === "GROWTH") {
    const measurements = [
      validMeasurement(weightKg) ? `${formatMeasurement(weightKg)}kg` : null,
      validMeasurement(heightCm) ? `${formatMeasurement(heightCm)}cm` : null,
    ].filter(Boolean);
    const genderLabel = gender === "MALE" ? "남아" : gender === "FEMALE" ? "여아" : "등록 성별";

    if (measurements.length > 0) {
      return `${detail} 최신 ${measurements.join(" · ")} 기록은 ${genderLabel} 성장표에서 이전 기록과 이어지는 흐름으로 살펴보세요.`;
    }
  }

  return detail;
}

function validMeasurement(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function formatMeasurement(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}
