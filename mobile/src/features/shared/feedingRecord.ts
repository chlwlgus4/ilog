export type FeedingMethodKey = "FORMULA" | "BREAST" | "SOLID";
export type FeedingMetricUnit = "ml" | "min" | "g";

export type FeedingMethodOption = {
  key: FeedingMethodKey;
  label: string;
  recordSubtype: string;
  inputLabel: string;
  inputPlaceholder: string;
  unit: FeedingMetricUnit;
};

export type FeedingLogLike = {
  value: string;
  recordedAt?: string;
  recordSubtype?: string | null;
  details?: Record<string, unknown>;
};

export type FeedingMetric = {
  method: FeedingMethodKey;
  methodLabel: string;
  unit: FeedingMetricUnit;
  value: number;
};

export const feedingMethodOptions: readonly FeedingMethodOption[] = [
  {
    key: "FORMULA",
    label: "분유",
    recordSubtype: "분유",
    inputLabel: "먹은 양",
    inputPlaceholder: "예: 120",
    unit: "ml",
  },
  {
    key: "BREAST",
    label: "모유(직수)",
    recordSubtype: "모유",
    inputLabel: "먹은 시간",
    inputPlaceholder: "예: 15",
    unit: "min",
  },
  {
    key: "SOLID",
    label: "이유식",
    recordSubtype: "이유식",
    inputLabel: "먹은 양",
    inputPlaceholder: "예: 80",
    unit: "g",
  },
] as const;

const methodAliases: Record<FeedingMethodKey, readonly string[]> = {
  FORMULA: ["FORMULA", "분유"],
  BREAST: ["BREAST", "모유", "모유(직수)", "직수"],
  SOLID: ["SOLID", "이유식"],
};

export function feedingMethodOption(key: FeedingMethodKey | null | undefined) {
  return feedingMethodOptions.find((option) => option.key === key) ?? null;
}

export function feedingMethodKeyForValue(value: unknown): FeedingMethodKey | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  for (const [key, aliases] of Object.entries(methodAliases) as Array<[FeedingMethodKey, readonly string[]]>) {
    if (aliases.some((alias) => alias.toUpperCase() === normalized)) {
      return key;
    }
  }

  return null;
}

export function buildFeedingRecordData({
  method,
  measurement,
  breastSide,
  foodName,
}: {
  method: FeedingMethodKey | null;
  measurement: string;
  breastSide?: string | null;
  foodName?: string;
}) {
  const option = feedingMethodOption(method);
  const numericValue = parsePositiveNumber(measurement);

  if (!option || numericValue === null) {
    return null;
  }

  const commonDetails = {
    feedingMethod: option.key,
    method: option.recordSubtype,
    unit: option.unit,
  };

  if (option.key === "BREAST") {
    const side = breastSide?.trim();

    if (!side) {
      return null;
    }

    return {
      value: `${formatFeedingNumber(numericValue)}분 · ${side}`,
      recordSubtype: option.recordSubtype,
      details: {
        ...commonDetails,
        durationMinutes: numericValue,
        side,
      },
    };
  }

  if (option.key === "SOLID") {
    const normalizedFoodName = foodName?.trim() ?? "";
    const amountLabel = `${formatFeedingNumber(numericValue)} g`;

    return {
      value: normalizedFoodName ? `${amountLabel} · ${normalizedFoodName}` : amountLabel,
      recordSubtype: option.recordSubtype,
      details: {
        ...commonDetails,
        amountGrams: numericValue,
        ...(normalizedFoodName ? { foodName: normalizedFoodName } : {}),
      },
    };
  }

  return {
    value: `${formatFeedingNumber(numericValue)} ml`,
    recordSubtype: option.recordSubtype,
    details: {
      ...commonDetails,
      amountMl: numericValue,
    },
  };
}

export function feedingMetricForLog(log: FeedingLogLike): FeedingMetric | null {
  const details = log.details ?? {};
  const method =
    feedingMethodKeyForValue(details.feedingMethod) ??
    feedingMethodKeyForValue(details.method) ??
    feedingMethodKeyForValue(log.recordSubtype) ??
    inferMethodFromValue(log.value);
  const unit = readMetricUnit(details.unit) ?? inferUnitFromValue(log.value) ?? defaultUnitForMethod(method);

  if (!method || !unit) {
    return null;
  }

  const value = readMetricValue(details, unit) ?? parsePositiveNumber(log.value);

  if (value === null) {
    return null;
  }

  return {
    method,
    methodLabel: feedingMethodOption(method)?.label ?? "맘마",
    unit,
    value,
  };
}

export function summarizeFeedingLogs<T extends FeedingLogLike>(logs: T[]) {
  const parsed = logs
    .map((log) => ({ log, metric: feedingMetricForLog(log) }))
    .filter((item): item is { log: T; metric: FeedingMetric } => item.metric !== null)
    .sort((a, b) => Date.parse(b.log.recordedAt ?? "") - Date.parse(a.log.recordedAt ?? ""));
  const latest = parsed[0]?.metric;

  if (!latest) {
    return null;
  }

  const comparable = parsed.filter(
    ({ metric }) => metric.method === latest.method && metric.unit === latest.unit,
  );
  const total = comparable.reduce((sum, { metric }) => sum + metric.value, 0);

  return {
    method: latest.method,
    methodLabel: latest.methodLabel,
    unit: latest.unit,
    total,
    logs: comparable.map(({ log }) => log),
    value: `${latest.methodLabel} ${formatFeedingNumber(total)} ${feedingUnitLabel(latest.unit)}`,
  };
}

export function formatFeedingMetric(metric: FeedingMetric) {
  return `${formatFeedingNumber(metric.value)} ${feedingUnitLabel(metric.unit)}`;
}

export function feedingUnitLabel(unit: FeedingMetricUnit) {
  return unit === "min" ? "분" : unit;
}

function defaultUnitForMethod(method: FeedingMethodKey | null): FeedingMetricUnit | null {
  return feedingMethodOption(method)?.unit ?? null;
}

function inferMethodFromValue(value: string): FeedingMethodKey | null {
  const unit = inferUnitFromValue(value);

  if (unit === "ml") {
    return "FORMULA";
  }
  if (unit === "min") {
    return "BREAST";
  }
  if (unit === "g") {
    return "SOLID";
  }

  return null;
}

function inferUnitFromValue(value: string): FeedingMetricUnit | null {
  if (/\bml\b/i.test(value)) {
    return "ml";
  }
  if (/\d\s*(?:분|min)/i.test(value)) {
    return "min";
  }
  if (/\d\s*g\b/i.test(value)) {
    return "g";
  }

  return null;
}

function readMetricUnit(value: unknown): FeedingMetricUnit | null {
  if (value === "ml" || value === "min" || value === "g") {
    return value;
  }

  return null;
}

function readMetricValue(details: Record<string, unknown>, unit: FeedingMetricUnit) {
  const keysByUnit: Record<FeedingMetricUnit, readonly string[]> = {
    ml: ["amountMl", "volumeMl", "milkMl", "feedingMl", "ml"],
    min: ["durationMinutes", "minutes", "duration"],
    g: ["amountGrams", "grams", "amountG"],
  };

  for (const key of keysByUnit[unit]) {
    const value = parsePositiveNumber(details[key]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function parsePositiveNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^0-9.]/g, ""))
        : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatFeedingNumber(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}
