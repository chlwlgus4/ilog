import type { FeedingMethodKey } from "./feedingRecord";

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

export type GuidanceSourceKey =
  | "CDC_FORMULA"
  | "CDC_BREASTFEEDING"
  | "CDC_SOLIDS"
  | "AAP_FORMULA"
  | "AASM_SLEEP"
  | "WHO_GROWTH"
  | "KDCA_VACCINATION"
  | "GENERAL_RECORDING";

export type AgeGuidanceCopy = {
  headline: string;
  detail: string;
};

export type AgeGuidanceRule = AgeGuidanceCopy & {
  minMonths: number;
  source: GuidanceSourceKey;
};

export type AgeGuidanceRuleSet = {
  withoutBirthDate: AgeGuidanceCopy;
  rules: readonly AgeGuidanceRule[];
};

export const guidanceSources: Record<GuidanceSourceKey, { organization: string; url: string }> = {
  CDC_FORMULA: {
    organization: "CDC",
    url: "https://www.cdc.gov/infant-toddler-nutrition/formula-feeding/how-much-and-how-often.html",
  },
  CDC_BREASTFEEDING: {
    organization: "CDC",
    url: "https://www.cdc.gov/infant-toddler-nutrition/breastfeeding/how-much-and-how-often.html",
  },
  CDC_SOLIDS: {
    organization: "CDC",
    url: "https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/when-what-and-how-to-introduce-solid-foods.html",
  },
  AAP_FORMULA: {
    organization: "AAP",
    url: "https://www.healthychildren.org/English/ages-stages/baby/formula-feeding/Pages/amount-and-schedule-of-formula-feedings.aspx",
  },
  AASM_SLEEP: {
    organization: "AASM",
    url: "https://aasm.org/advocacy/position-statements/child-sleep-duration-health-advisory/",
  },
  WHO_GROWTH: {
    organization: "WHO",
    url: "https://www.who.int/tools/child-growth-standards/standards",
  },
  KDCA_VACCINATION: {
    organization: "질병관리청",
    url: "https://nip.kdca.go.kr/irhp/infm/goVcntInfo.do?menuCd=132&menuLv=1",
  },
  GENERAL_RECORDING: {
    organization: "아이로그 기록 원칙",
    url: "",
  },
};

export const feedingAgeGuidanceRuleSets: Record<FeedingMethodKey, AgeGuidanceRuleSet> = {
  FORMULA: {
    withoutBirthDate: {
      headline: "생년월일을 입력하면 지금 시기에 알맞은 분유 안내를 보여드려요.",
      detail: "양과 간격은 아이의 배고픔·포만 신호에 따라 달라질 수 있어요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "생후 첫 달에는 아이 신호에 맞춰 한 번의 양을 점차 늘려요.",
        detail: "첫 주에는 한 번 30-60 ml, 첫 달 말에는 90-120 ml 정도로 늘어날 수 있어요. 아이 반응을 먼저 살펴 주세요.",
        source: "AAP_FORMULA",
      },
      {
        minMonths: 1,
        headline: "한 번 90-120 ml, 약 3-4시간 간격으로 먹는 시기예요.",
        detail: "정해진 양을 다 먹이기보다 포만 신호가 보이면 멈춰 주세요.",
        source: "CDC_FORMULA",
      },
      {
        minMonths: 2,
        headline: "한 번의 양보다 하루 전체 맘마 횟수와 반응을 함께 살펴요.",
        detail: "먹는 양이 갑자기 줄거나 늘면 시간, 컨디션, 게움 여부도 같이 기록해요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 4,
        headline: "분유는 여전히 주식이며 아이의 포만 신호에 맞춰 조절해요.",
        detail: "이유식은 개월수만이 아니라 목 가누기와 음식 삼키기 같은 준비 신호를 확인해요.",
        source: "CDC_SOLIDS",
      },
      {
        minMonths: 6,
        headline: "한 번 180-240 ml 안팎으로 먹으며 이유식도 함께 시작하는 시기예요.",
        detail: "분유와 이유식을 합친 하루 섭취 흐름과 아이의 반응을 함께 살펴요.",
        source: "AAP_FORMULA",
      },
      {
        minMonths: 12,
        headline: "돌 이후에는 분유만이 아니라 식사와 우유 섭취를 함께 봐요.",
        detail: "전환 시점과 섭취량은 아이 상태에 맞춰 의료진과 상의하세요.",
        source: "CDC_FORMULA",
      },
    ],
  },
  BREAST: {
    withoutBirthDate: {
      headline: "직수는 먹은 양 대신 시간과 방향을 기록해요.",
      detail: "생년월일을 입력하면 지금 시기에 자주 보이는 먹는 횟수와 간격도 알려드려요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "첫 시기에는 하루 8-12회, 1-3시간 간격으로 먹는 경우가 많아요.",
        detail: "직수 시간은 섭취량과 같지 않으므로 방향, 반응, 젖은 기저귀도 함께 기록해요.",
        source: "CDC_BREASTFEEDING",
      },
      {
        minMonths: 1,
        headline: "대체로 2-4시간마다 먹지만 더 자주 찾는 시기도 있어요.",
        detail: "먹은 시간과 방향, 먹은 뒤 만족도와 젖은 기저귀 흐름을 함께 봐요.",
        source: "CDC_BREASTFEEDING",
      },
      {
        minMonths: 3,
        headline: "맘마 간격과 한 번 먹는 시간은 아이마다 달라질 수 있어요.",
        detail: "갑작스러운 패턴 변화가 있으면 직수 시간과 컨디션을 같이 기록해요.",
        source: "CDC_BREASTFEEDING",
      },
      {
        minMonths: 6,
        headline: "이유식과 병행해도 배고픔 신호에 따라 모유를 이어갈 수 있어요.",
        detail: "이유식 전후 직수 시간과 방향을 기록하면 하루 흐름을 보기 쉬워요.",
        source: "CDC_BREASTFEEDING",
      },
      {
        minMonths: 12,
        headline: "돌 이후 직수 횟수는 식사와 아이 요구에 따라 달라져요.",
        detail: "시간을 양으로 환산하지 말고 식사·수면과 함께 패턴을 확인해요.",
        source: "CDC_BREASTFEEDING",
      },
    ],
  },
  SOLID: {
    withoutBirthDate: {
      headline: "생년월일을 등록하면 이유식 시작 시기와 기록 항목을 안내해요.",
      detail: "먹은 양뿐 아니라 식재료, 질감, 아이 반응을 함께 기록해요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "이유식은 생후 4개월 전에는 시작하지 않아요.",
        detail: "보통 약 6개월부터 목 가누기와 음식 삼키기 같은 준비 신호를 확인해 시작해요.",
        source: "CDC_SOLIDS",
      },
      {
        minMonths: 4,
        headline: "개월수와 함께 앉기·목 가누기·삼키기 준비 신호를 확인해요.",
        detail: "처음부터 양을 채우기보다 새로운 질감과 반응에 적응하는 과정을 기록해요.",
        source: "CDC_SOLIDS",
      },
      {
        minMonths: 6,
        headline: "새 식재료는 한 번에 하나씩, 3-5일 반응을 살펴요.",
        detail: "먹은 양(g), 식재료, 질감, 알레르기 의심 반응을 함께 기록해요.",
        source: "CDC_SOLIDS",
      },
      {
        minMonths: 8,
        headline: "다양한 식재료와 질감을 경험하도록 천천히 넓혀가요.",
        detail: "삼킨 양뿐 아니라 손으로 집어 먹기와 거부 반응도 메모해 두면 좋아요.",
        source: "CDC_SOLIDS",
      },
      {
        minMonths: 12,
        headline: "가족 식사와 연결하되 아이가 먹기 안전한 크기와 질감을 우선해요.",
        detail: "먹은 양과 식재료, 식사 시간, 반응을 함께 기록해 균형을 살펴요.",
        source: "CDC_SOLIDS",
      },
    ],
  },
};

export const recordAgeGuidanceRuleSets: Record<Exclude<RecordAgeGuidanceCategory, "FEEDING">, AgeGuidanceRuleSet> = {
  SLEEP: {
    withoutBirthDate: {
      headline: "생년월일을 입력하면 지금 시기에 알맞은 하루 잠 시간을 보여드려요.",
      detail: "낮잠과 밤잠을 함께 기록하면 하루 패턴을 보기 쉬워요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "생후 4개월 전에는 정해진 잠 시간보다 아이의 잠과 깸 흐름을 살펴보세요.",
        detail: "잠든 시간과 깬 시간, 맘마 시간을 함께 남기면 하루 흐름을 이해하기 쉬워요.",
        source: "AASM_SLEEP",
      },
      {
        minMonths: 4,
        headline: "하루 잠은 낮잠을 포함해 12-16시간이 알맞아요.",
        detail: "하루마다 차이가 있을 수 있으니 주간 흐름을 함께 확인해요.",
        source: "AASM_SLEEP",
      },
      {
        minMonths: 12,
        headline: "하루 잠은 낮잠을 포함해 11-14시간이 알맞아요.",
        detail: "일관된 취침·기상 시간을 기록하면 잠 패턴을 보기 좋아요.",
        source: "AASM_SLEEP",
      },
      {
        minMonths: 24,
        headline: "하루 잠은 낮잠을 포함해 10-13시간이 알맞아요.",
        detail: "잠 시간은 활동량과 컨디션에 따라 달라질 수 있어요.",
        source: "AASM_SLEEP",
      },
      {
        minMonths: 60,
        headline: "하루 잠은 9-12시간이 알맞아요.",
        detail: "취침·기상 시각과 낮 시간 피로도를 함께 기록해요.",
        source: "AASM_SLEEP",
      },
      {
        minMonths: 156,
        headline: "하루 잠은 8-10시간이 알맞아요.",
        detail: "주중과 주말의 수면 시각 차이도 함께 살펴보세요.",
        source: "AASM_SLEEP",
      },
    ],
  },
  DIAPER: {
    withoutBirthDate: {
      headline: "생년월일을 등록하면 시기별 기저귀 기록 포인트를 보여드려요.",
      detail: "횟수뿐 아니라 색, 묽기, 갑작스러운 변화도 함께 기록해요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "생후 첫 시기에는 젖은 기저귀 횟수가 날마다 늘어나는지 살펴요.",
        detail: "생후 5일 뒤에는 하루 6회 이상 젖는지 살펴보고 평소보다 갑자기 줄지 않는지 확인해요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 1,
        headline: "젖은 기저귀와 대변 횟수의 평소 패턴을 함께 봐요.",
        detail: "횟수보다 갑작스러운 감소, 색과 묽기 변화를 메모하는 것이 중요해요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 6,
        headline: "이유식 시작 뒤에는 대변 색과 굳기가 달라질 수 있어요.",
        detail: "새 식재료와 기저귀 변화를 같은 날짜에 기록하면 원인을 살피기 쉬워요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 12,
        headline: "식사와 수분 섭취에 따른 기저귀 패턴을 함께 확인해요.",
        detail: "배변 간격, 통증이나 힘주기, 변 상태의 변화를 기록해요.",
        source: "GENERAL_RECORDING",
      },
    ],
  },
  TEMPERATURE: {
    withoutBirthDate: {
      headline: "체온이 38.0°C 이상이면 아이 상태를 세심하게 살펴 주세요.",
      detail: "생년월일과 측정 부위를 등록하면 해석에 도움이 돼요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "생후 3개월 미만에서 38.0°C 이상이면 바로 의료진과 상의하세요.",
        detail: "측정 시각과 부위, 맘마량, 처짐 여부를 함께 기록해요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 3,
        headline: "체온이 38.0°C 이상이면 아이 상태를 세심하게 살펴 주세요.",
        detail: "측정 부위와 아이 컨디션, 수분 섭취도 함께 메모해요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 36,
        headline: "체온 숫자와 함께 활동성·수분 섭취·통증을 살펴요.",
        detail: "측정 부위와 해열제 사용 시각을 함께 남기면 진료에 도움이 돼요.",
        source: "GENERAL_RECORDING",
      },
    ],
  },
  MEDICINE: {
    withoutBirthDate: {
      headline: "복용량은 개월수가 아니라 체중과 약 성분에 따라 달라져요.",
      detail: "처방전과 제품 안내의 용법·용량을 그대로 기록해요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "영아의 약은 임의로 용량을 정하지 말고 의료진 안내를 따라요.",
        detail: "약 이름, 처방 용량, 복용 시각과 복용 뒤 반응을 기록해요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 6,
        headline: "약의 양은 개월수만 보지 말고 체중과 약 성분을 함께 확인해요.",
        detail: "처방전 또는 제품 안내의 1회 용량과 간격을 그대로 기록해요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 12,
        headline: "같은 증상이라도 약 성분과 농도에 따라 용량이 달라져요.",
        detail: "약 이름, 농도, 실제 복용량, 마지막 복용 시각을 함께 남겨요.",
        source: "GENERAL_RECORDING",
      },
    ],
  },
  PUMPING: {
    withoutBirthDate: {
      headline: "유축량은 한 번의 수치보다 하루 전체 패턴을 보는 편이 좋아요.",
      detail: "유축 시간, 방향, 유축량을 함께 남겨요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "초기에는 유축량 하나보다 유축 횟수와 하루 흐름을 함께 봐요.",
        detail: "유축 시각, 방향, 소요 시간과 양을 함께 기록해요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 2,
        headline: "같은 시간대의 유축량을 비교하면 변화 흐름을 보기 쉬워요.",
        detail: "맘마 직전·직후 여부와 방향을 함께 기록해요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 6,
        headline: "이유식과 맘마 패턴 변화에 따라 유축 흐름도 달라질 수 있어요.",
        detail: "이유식 시간과 유축 시각을 함께 남겨 하루 패턴을 확인해요.",
        source: "GENERAL_RECORDING",
      },
    ],
  },
  GROWTH: {
    withoutBirthDate: {
      headline: "생년월일을 등록하면 연령에 맞는 성장 기록 항목을 안내해요.",
      detail: "한 번의 값보다 같은 조건에서 이어서 측정한 흐름이 중요해요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "체중·누운 키·머리둘레를 개월수 성장 곡선에서 함께 확인해요.",
        detail: "같은 조건으로 측정하고 한 번의 값보다 변화 흐름을 살펴요.",
        source: "WHO_GROWTH",
      },
      {
        minMonths: 24,
        headline: "선 키와 체중을 같은 연령·성별 성장 흐름에서 확인해요.",
        detail: "측정 조건을 맞추고 갑작스러운 변화가 있는지 살펴요.",
        source: "WHO_GROWTH",
      },
      {
        minMonths: 60,
        headline: "키와 체중은 연령별 성장 곡선의 추세로 확인해요.",
        detail: "개별 수치보다 이전 측정값과 이어지는 성장 흐름이 중요해요.",
        source: "WHO_GROWTH",
      },
    ],
  },
  VACCINATION: {
    withoutBirthDate: {
      headline: "생년월일을 등록하면 시기별 접종 확인 포인트를 보여드려요.",
      detail: "실제 접종일은 국가예방접종 일정과 의료기관 안내에 따라 확인해요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "출생 직후와 첫 달 접종 일정을 예방접종도우미에서 확인해요.",
        detail: "접종명, 차수, 접종일과 다음 예정일을 함께 기록해요.",
        source: "KDCA_VACCINATION",
      },
      {
        minMonths: 2,
        headline: "영아기 기초접종 차수와 다음 예정일을 함께 확인해요.",
        detail: "실제 접종 가능 시기는 의료기관과 국가예방접종 일정을 우선해요.",
        source: "KDCA_VACCINATION",
      },
      {
        minMonths: 12,
        headline: "돌 전후 추가 접종과 누락된 차수가 없는지 확인해요.",
        detail: "접종 완료일과 다음 차수 예정일을 함께 남겨요.",
        source: "KDCA_VACCINATION",
      },
      {
        minMonths: 24,
        headline: "연령별 추가접종과 따라잡기 일정을 확인해요.",
        detail: "누락 여부는 예방접종도우미 또는 의료기관에서 확인하세요.",
        source: "KDCA_VACCINATION",
      },
    ],
  },
  HOSPITAL: {
    withoutBirthDate: {
      headline: "방문 전 증상 시작 시각과 체온, 섭취·기저귀 변화를 정리해요.",
      detail: "진단과 처방 내용은 의료진 안내 그대로 기록해요.",
    },
    rules: [
      {
        minMonths: 0,
        headline: "체온·맘마량·호흡·처짐 여부를 우선 정리해요.",
        detail: "증상 시작 시각과 젖은 기저귀 횟수를 함께 기록해 진료 시 보여주세요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 3,
        headline: "증상 시작 시각과 체온, 맘마·기저귀 변화를 함께 정리해요.",
        detail: "복용한 약과 마지막 복용 시각도 함께 기록해요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 12,
        headline: "열·호흡·배변·활동성 변화를 시간 순서로 정리해요.",
        detail: "먹고 마신 양과 복용한 약을 함께 남기면 진료에 도움이 돼요.",
        source: "GENERAL_RECORDING",
      },
      {
        minMonths: 36,
        headline: "증상과 지속 시간, 통증 위치, 복용 약을 함께 정리해요.",
        detail: "알레르기와 최근 진료·검사 내용도 함께 준비해요.",
        source: "GENERAL_RECORDING",
      },
    ],
  },
};

export function resolveAgeGuidanceRule(ruleSet: AgeGuidanceRuleSet, ageMonths: number | null): AgeGuidanceCopy {
  if (ageMonths === null) {
    return ruleSet.withoutBirthDate;
  }

  const matchingRule = [...ruleSet.rules]
    .sort((a, b) => a.minMonths - b.minMonths)
    .filter((rule) => ageMonths >= rule.minMonths)
    .at(-1);

  return matchingRule ?? ruleSet.withoutBirthDate;
}
