import { childAgeInMonths } from "./childAge";

export type RecordAgeGuidanceCategory =
  | "FEEDING"
  | "SLEEP"
  | "DIAPER"
  | "TEMPERATURE"
  | "MEDICINE"
  | "PUMPING"
  | "GROWTH"
  | "VACCINATION"
  | "HOSPITAL";

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
  referenceDate?: Date;
};

const defaultCaution = "참고값이며, 아이 상태와 의료진 또는 제품 안내를 우선해요.";

export function getRecordAgeGuidance({
  category,
  birthDate,
  feedingMethod,
  referenceDate,
}: RecordAgeGuidanceInput): RecordAgeGuidance {
  const ageMonths = childAgeInMonths(birthDate ?? "", referenceDate);
  const eyebrow = ageMonths === null ? "개월수 기반 기록 참고" : `생후 ${ageMonths}개월 기록 참고`;

  switch (category) {
    case "FEEDING":
      return feedingGuidance(eyebrow, ageMonths, feedingMethod);
    case "SLEEP":
      return sleepGuidance(eyebrow, ageMonths);
    case "DIAPER":
      return guidance(
        eyebrow,
        "생후 5일 이후에는 하루 젖은 기저귀 6회 이상을 한 가지 참고 지표로 봐요.",
        "횟수뿐 아니라 색, 묽기, 갑작스러운 변화도 함께 기록하면 좋아요.",
      );
    case "TEMPERATURE":
      return guidance(
        eyebrow,
        "38.0°C 이상은 발열 참고 기준이에요.",
        ageMonths !== null && ageMonths < 3
          ? "생후 3개월 이하에서 38.0°C 이상이면 바로 의료진과 상의하세요."
          : "측정 부위와 아이 컨디션도 메모해 두면 진료 시 도움이 돼요.",
      );
    case "MEDICINE":
      return guidance(
        eyebrow,
        "복용량은 개월수가 아니라 체중과 약 성분에 따라 달라져요.",
        "처방전과 제품 안내의 용법·용량을 그대로 기록해 주세요.",
      );
    case "PUMPING":
      return guidance(
        eyebrow,
        "유축량은 한 번의 수치보다 하루 전체 패턴을 보는 편이 좋아요.",
        "유축 시간, 방향, 유축량을 함께 남기면 변화 추이를 보기 쉬워요.",
      );
    case "GROWTH":
      return guidance(
        eyebrow,
        "성장 수치는 같은 성별과 개월수의 성장 곡선에서 함께 확인해요.",
        "한 번의 값보다 같은 조건에서 이어서 측정한 흐름이 더 중요해요.",
      );
    case "VACCINATION":
      return guidance(
        eyebrow,
        "예방접종 시기는 국가예방접종 일정과 의료기관 안내를 기준으로 확인해요.",
        "접종명, 차수, 예정일 또는 완료일을 함께 기록해 두세요.",
      );
    case "HOSPITAL":
      return guidance(
        eyebrow,
        "방문 전 증상 시작 시각과 체온, 섭취·배변 변화를 함께 정리해 보세요.",
        "진단과 처방 내용은 의료진 안내 그대로 기록하는 것이 좋아요.",
      );
  }
}

function feedingGuidance(eyebrow: string, ageMonths: number | null, feedingMethod?: string | null) {
  if (!feedingMethod) {
    return guidance(
      eyebrow,
      "수유 방법을 선택하면 개월수에 맞는 기록 참고값을 보여드려요.",
      "수유량과 간격은 아기의 배고픔·포만 신호를 함께 보고 조절해요.",
    );
  }

  if (feedingMethod === "모유") {
    return guidance(
      eyebrow,
      "직수는 ml보다 수유 횟수와 수유 후 반응을 함께 기록해요.",
      "젖은 기저귀와 체중 변화도 수유 패턴을 살피는 데 도움이 돼요.",
    );
  }

  if (feedingMethod === "이유식") {
    if (ageMonths !== null && ageMonths < 4) {
      return guidance(
        eyebrow,
        "이유식은 생후 4개월 전에는 시작하지 않아요.",
        "보통 생후 약 6개월부터 앉기·목 가누기 같은 준비 신호를 확인해 시작해요.",
      );
    }

    return guidance(
      eyebrow,
      "이유식은 모유 또는 분유와 병행하며 아이의 준비 신호에 맞춰 늘려가요.",
      "처음에는 새로운 식품과 반응을 메모해 두면 좋아요.",
    );
  }

  if (ageMonths === null) {
    return guidance(
      eyebrow,
      "생년월일을 등록하면 분유량과 간격 참고값을 보여드려요.",
      "수유량은 아기의 배고픔·포만 신호에 따라 달라질 수 있어요.",
    );
  }

  if (ageMonths < 1) {
    return guidance(eyebrow, "한 번 30-60ml, 2-3시간 간격부터 참고하세요.", "수유량은 한 번에 늘리기보다 아기 반응을 보며 조절해요.");
  }

  if (ageMonths < 2) {
    return guidance(eyebrow, "한 번 90-120ml, 약 3-4시간 간격을 참고하세요.", "수유 간격과 양은 아기 포만 신호에 따라 달라질 수 있어요.");
  }

  if (ageMonths < 6) {
    return guidance(eyebrow, "한 번 120-180ml를 참고하되, 아기 포만 신호에 맞춰 조절하세요.", "한 번의 양보다 하루 총 수유 패턴을 함께 살펴보는 편이 좋아요.");
  }

  if (ageMonths < 12) {
    return guidance(eyebrow, "한 번 180-240ml를 참고하고, 이유식과 함께 수유 패턴을 기록하세요.", "분유와 이유식의 비중은 아이의 성장과 식사 적응에 따라 달라져요.");
  }

  return guidance(
    eyebrow,
    "돌 이후에는 분유만으로 필요한 양을 정하지 않고 식사와 우유 섭취를 함께 봐요.",
    "전환 시점과 섭취량은 아이 상태에 맞춰 의료진과 상의하세요.",
  );
}

function sleepGuidance(eyebrow: string, ageMonths: number | null) {
  if (ageMonths === null) {
    return guidance(eyebrow, "생년월일을 등록하면 개월수에 맞는 하루 수면 참고값을 보여드려요.", "낮잠과 밤잠 시간을 함께 기록하면 패턴을 보기 쉬워요.");
  }

  if (ageMonths < 4) {
    return guidance(eyebrow, "생후 4개월 전에는 일일 권장 수면시간 기준이 충분하지 않아요.", "수면 시간과 수유·각성 패턴을 함께 기록해 변화만 살펴보세요.");
  }

  if (ageMonths < 12) {
    return guidance(eyebrow, "하루 총 수면 12-16시간(낮잠 포함)을 참고하세요.", "하루마다 차이가 있을 수 있으니 주간 흐름을 함께 확인해요.");
  }

  if (ageMonths < 24) {
    return guidance(eyebrow, "하루 총 수면 11-14시간(낮잠 포함)을 참고하세요.", "일관된 취침·기상 시간을 기록하면 수면 패턴을 보기 좋아요.");
  }

  return guidance(eyebrow, "하루 총 수면 10-13시간(낮잠 포함)을 참고하세요.", "수면 시간은 아이의 활동량과 컨디션에 따라 달라질 수 있어요.");
}

function guidance(eyebrow: string, headline: string, detail: string): RecordAgeGuidance {
  return {
    eyebrow,
    headline,
    detail,
    caution: defaultCaution,
  };
}
