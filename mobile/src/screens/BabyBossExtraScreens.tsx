import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  BarChart as GiftedBarChart,
  LineChart as GiftedLineChart,
  PieChart as GiftedPieChart,
  type barDataItem,
  type lineDataItem,
  type pieDataItem,
} from "react-native-gifted-charts";
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from "react-native-svg";

import {
  CalendarDatePickerOverlay,
  defaultStatsDate,
  endOfWeek,
  formatDateRangeLabel,
  formatDateKey,
  formatStatsRangeLabel,
  shiftDateByPeriod,
  startOfWeek,
  type DateRange,
} from "../features/shared/CalendarDatePicker";
import {
  createFamilyInvitation,
  createFamilyChatMessage,
  createFamilyPhoto,
  createGrowthMeasurement,
  createHospitalVisit,
  createLog,
  createVaccination,
  deleteFamilyPhoto,
  fetchFamilyInvitations,
  fetchGrowthMeasurements,
  fetchHospitalVisits,
  fetchLogs,
  fetchPhotoAlbum,
  fetchSettings,
  fetchVaccinations,
  requestDataExport,
  restoreSession,
  searchFamilyRecords,
  updateChildProfile,
  updateCaregiverPersonalInfo,
  updateNotificationPreferences,
  upsertRecordAlarmRule,
  type AlarmNotifyScope,
  type CaregiverRole,
  type CaregiverSummary,
  type CreateLogRequest,
  type CreateFamilyChatMessageRequest,
  type FamilyPhotoCard,
  type FamilyInvitationCard,
  type GrowthMeasurementCard,
  type HospitalVisitCard,
  type LogCard,
  type LogType,
  type NotificationPreferencesSummary,
  type RecordAlarmRuleCard,
  type SearchResultCard,
  type SessionResponse,
  type VaccinationCard,
} from "../api";
import { caregiverRoleOptions, nicknameForRoleChange, roleDefaultNickname, roleLabel } from "../constants";
import { useBabyBossAppContext } from "../hooks/BabyBossAppContext";
import { ProfileImageField } from "../features/shared/ProfileImageField";
import { FamilyChatView } from "../features/chat/FamilyChatView";
import { FamilyImagePreviewModal } from "../features/shared/FamilyImagePreviewModal";
import { imagePickerAssetToUpload } from "../features/shared/imageUpload";
import {
  isDirectFamilyAlbumPhoto,
  MAX_FAMILY_ALBUM_UPLOADS,
  removeDeletedAlbumPhotos,
  togglePhotoSelection,
} from "../features/shared/photoAlbumUtils";
import {
  configurableRecordReminderLogTypes,
  defaultRecordAlarmIntervals,
} from "../features/shared/recordReminderDefaults";
import { RecordIcon, type RecordIconName } from "../features/shared/RecordIcon";
import { scheduleLocalRecordAlarmNotification } from "../serverless/pushNotifications";
import { FONT_FAMILY } from "../typography";

const primary = "#4DB6AC";
const text = "#111827";
const muted = "#6B7280";
const border = "#E9EDF3";
const soft = "#F8FAFC";
const paleBlue = "#E7F6F3";

type BackTarget = "/home" | "/quick-add" | "/settings" | "/timeline" | "/statistics" | "/growth" | "/app-info";

type SegmentOption = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  testID?: string;
};
type DetailStatsPeriod = "daily" | "weekly" | "monthly";
type DetailStatsKind =
  | "feeding"
  | "sleep"
  | "diaper"
  | "temperature"
  | "medicine"
  | "pumping"
  | "growth"
  | "vaccination"
  | "hospital";
type DetailStatsConfig = {
  testID: string;
  title: string;
  metricTitle: string;
  chart: "bar" | "line" | "donut";
  emptyValue: string;
};
type DetailStatsMetric = { value: string; meta: string };
type DetailStatsPoint = { label: string; value: number; timestamp: number };
type DetailStatsRecord = { id: string; label: string; value: string };
type DetailStatsDonutSegment = { label: string; value: number; color: string };
type DetailStatsSourceData = {
  logs: LogCard[];
  growthMeasurements: GrowthMeasurementCard[];
  vaccinations: VaccinationCard[];
  hospitalVisits: HospitalVisitCard[];
};
type DetailStatsViewModel = {
  metric: DetailStatsMetric;
  records: DetailStatsRecord[];
  chartData: DetailStatsPoint[];
  donutData: DetailStatsDonutSegment[];
};
type RecordAlarmFormState = {
  enabled: boolean;
  minutes: string;
  notifyScope: AlarmNotifyScope;
};
type RecordAlarmFormMap = Partial<Record<LogType, RecordAlarmFormState>>;
type RecordShareFormState = {
  enabled: boolean;
  excludedCaregiverIds: number[];
};

const alarmLogTypes: LogType[] = configurableRecordReminderLogTypes;
const defaultRecordAlarmMinutes: Record<LogType, number> = defaultRecordAlarmIntervals;

const detailStatPeriods: { key: DetailStatsPeriod; label: string }[] = [
  { key: "daily", label: "일간" },
  { key: "weekly", label: "주간" },
  { key: "monthly", label: "월간" },
];
const emptyDetailStatsSource: DetailStatsSourceData = {
  logs: [],
  growthMeasurements: [],
  vaccinations: [],
  hospitalVisits: [],
};
const detailStatsConfigs: Record<DetailStatsKind, DetailStatsConfig> = {
  feeding: {
    testID: "screen-feeding-stats",
    title: "수유 통계",
    metricTitle: "총 수유량",
    chart: "bar",
    emptyValue: "0 ml",
  },
  sleep: {
    testID: "screen-sleep-stats",
    title: "수면 통계",
    metricTitle: "총 수면 시간",
    chart: "line",
    emptyValue: "0분",
  },
  diaper: {
    testID: "screen-diaper-stats",
    title: "배변 통계",
    metricTitle: "총 배변 횟수",
    chart: "donut",
    emptyValue: "0 회",
  },
  temperature: {
    testID: "screen-temperature-stats",
    title: "체온 통계",
    metricTitle: "평균 체온",
    chart: "line",
    emptyValue: "- ℃",
  },
  medicine: {
    testID: "screen-medicine-stats",
    title: "약/영양제 통계",
    metricTitle: "총 복용 횟수",
    chart: "bar",
    emptyValue: "0 회",
  },
  pumping: {
    testID: "screen-pumping-stats",
    title: "유축 통계",
    metricTitle: "총 유축량",
    chart: "bar",
    emptyValue: "0 ml",
  },
  growth: {
    testID: "screen-growth-stats",
    title: "성장 통계",
    metricTitle: "최근 성장 기록",
    chart: "line",
    emptyValue: "0 건",
  },
  vaccination: {
    testID: "screen-vaccination-stats",
    title: "예방접종 통계",
    metricTitle: "예방접종 기록",
    chart: "donut",
    emptyValue: "0 건",
  },
  hospital: {
    testID: "screen-hospital-stats",
    title: "병원 방문 통계",
    metricTitle: "병원 방문 횟수",
    chart: "bar",
    emptyValue: "0 건",
  },
};

function SpecShell({ children, testID, overlay }: { children: ReactNode; testID: string; overlay?: ReactNode }) {
  return (
    <View style={styles.appShell}>
      <View style={styles.phone}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.screenContent}
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID={testID}
        >
          {children}
        </ScrollView>
        {overlay}
      </View>
    </View>
  );
}

function useFallbackBack(target: BackTarget) {
  const router = useRouter();
  return () => router.replace(target);
}

function useHomeBack() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== "android") {
      return undefined;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      router.replace("/home");
      return true;
    });

    return () => subscription.remove();
  }, [router]);

  return () => router.replace("/home");
}

function useSpecAction(successMessage = "저장했어요.") {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(work: (session: SessionResponse) => Promise<unknown>) {
    if (busy) {
      return;
    }

    setBusy(true);
    setMessage("저장 중...");

    try {
      const session = await restoreSession();
      await work(session);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, message, run };
}

function useSaveAndNavigateAction(successMessage: string, target: string) {
  const router = useRouter();
  const app = useBabyBossAppContext();
  const action = useSpecAction(successMessage);

  async function run(work: (session: SessionResponse) => Promise<unknown>) {
    await action.run(async (session) => {
      await work(session);
      await app.refreshAll();
      router.replace(target);
    });
  }

  return { ...action, run };
}

function ActionStatus({ message }: { message: string | null }) {
  return message ? <Text style={styles.actionStatus}>{message}</Text> : null;
}

function requireSessionChild(session: SessionResponse) {
  if (!session.child) {
    throw new Error("아이 정보를 먼저 입력해 주세요.");
  }

  return session.child;
}

function formatDate(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatMonth(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "날짜 없음";
  }

  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
}

function invitationStatusLabel(status: FamilyInvitationCard["status"]) {
  switch (status) {
    case "PENDING":
      return "초대됨";
    case "ACCEPTED":
      return "수락";
    case "CANCELLED":
      return "취소";
    case "EXPIRED":
      return "만료";
  }
}

function toDateTimeInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeValue(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isValidDateTimeValue(value: string) {
  return Boolean(value.trim()) && !Number.isNaN(Date.parse(value));
}

function toRecordedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function mergeDatePart(value: string, date: Date) {
  const current = parseDateTimeValue(value);
  return toDateTimeInputValue(new Date(date.getFullYear(), date.getMonth(), date.getDate(), current.getHours(), current.getMinutes()));
}

function adjustDateTimeMinutes(value: string, minutes: number) {
  const date = parseDateTimeValue(value);
  date.setMinutes(date.getMinutes() + minutes);
  return toDateTimeInputValue(date);
}

function setDateTimeClock(value: string, hours: number, minutes: number) {
  const date = parseDateTimeValue(value);
  date.setHours(hours, minutes, 0, 0);
  return toDateTimeInputValue(date);
}

function formatClock(date: Date) {
  return `${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
}

function formatDateTimeLabel(value: string) {
  if (!isValidDateTimeValue(value)) {
    return "날짜와 시간을 선택하세요";
  }

  const date = parseDateTimeValue(value);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${formatClock(date)}`;
}

function parseDateOnlyValue(value: string) {
  const [year, month, day] = value.split("-").map((item) => Number(item));
  const date = new Date(year, (month || 1) - 1, day || 1);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isValidDateOnlyValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = parseDateOnlyValue(value);
  return formatDateKey(date) === value;
}

function formatDateOnlyLabel(value: string) {
  if (!isValidDateOnlyValue(value)) {
    return "날짜를 선택하세요";
  }

  const date = parseDateOnlyValue(value);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatChildDday(value: string) {
  const birthDate = parseDateOnlyValue(value);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((todayStart.getTime() - birthDate.getTime()) / 86_400_000) + 1;

  return diffDays >= 0 ? `D+${Math.max(diffDays, 1)}` : `D${diffDays}`;
}

function formatMlValue(value: string, fallback = 0) {
  const amount = parseMeasurement(value);
  return `${amount ?? fallback} ml`;
}

function parseMeasurement(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function durationLabel(startIso: string, endIso: string) {
  const minutes = Math.max(Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000), 0);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) {
    return `${rest}분`;
  }

  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

function emptyDetailStats(config: DetailStatsConfig, meta = "기록 없음"): DetailStatsViewModel {
  return {
    metric: { value: config.emptyValue, meta },
    records: [],
    chartData: [],
    donutData: [],
  };
}

function filterDetailStatsSource(
  source: DetailStatsSourceData,
  period: DetailStatsPeriod,
  selectedDate: Date,
  selectedRange: DateRange,
): DetailStatsSourceData {
  return {
    logs: filterDetailRecordsForStats(source.logs, period, selectedDate, selectedRange, (log) => log.recordedAt),
    growthMeasurements: filterDetailRecordsForStats(
      source.growthMeasurements,
      period,
      selectedDate,
      selectedRange,
      (measurement) => measurement.measuredAt,
    ),
    vaccinations: filterDetailRecordsForStats(
      source.vaccinations,
      period,
      selectedDate,
      selectedRange,
      (vaccination) => vaccination.completedAt ?? vaccination.dueAt,
    ),
    hospitalVisits: filterDetailRecordsForStats(
      source.hospitalVisits,
      period,
      selectedDate,
      selectedRange,
      (visit) => visit.visitedAt,
    ),
  };
}

function filterDetailRecordsForStats<T>(
  records: T[],
  period: DetailStatsPeriod,
  selectedDate: Date,
  selectedRange: DateRange,
  getDate: (record: T) => string,
) {
  return records.filter((record) => {
    const recordDate = new Date(getDate(record));
    const timestamp = recordDate.getTime();

    if (!Number.isFinite(timestamp)) {
      return false;
    }

    if (period === "weekly") {
      const start = startOfDetailDay(selectedRange.startDate).getTime();
      const end = endOfDetailDay(selectedRange.endDate).getTime();
      return timestamp >= start && timestamp <= end;
    }

    if (period === "monthly") {
      return recordDate.getFullYear() === selectedDate.getFullYear() && recordDate.getMonth() === selectedDate.getMonth();
    }

    return detailDateKey(recordDate) === detailDateKey(selectedDate);
  });
}

function buildDetailStatsViewModel(
  kind: DetailStatsKind,
  config: DetailStatsConfig,
  source: DetailStatsSourceData,
  period: DetailStatsPeriod,
): DetailStatsViewModel {
  if (kind === "growth") {
    return buildGrowthDetailStats(config, source.growthMeasurements, period);
  }

  if (kind === "vaccination") {
    return buildVaccinationDetailStats(config, source.vaccinations, period);
  }

  if (kind === "hospital") {
    return buildHospitalDetailStats(config, source.hospitalVisits, period);
  }

  return buildLogDetailStats(kind, config, source.logs.filter((log) => matchesDetailLogKind(kind, log)), period);
}

function buildLogDetailStats(
  kind: DetailStatsKind,
  config: DetailStatsConfig,
  logs: LogCard[],
  period: DetailStatsPeriod,
): DetailStatsViewModel {
  if (logs.length === 0) {
    return emptyDetailStats(config);
  }

  const sortedLogs = sortDetailLogs(logs);
  const latest = sortedLogs[0];
  const chartData = buildDetailLogChartData(kind, logs, period);

  return {
    metric: {
      value: formatDetailLogMetric(kind, logs),
      meta: formatDetailLatestMeta(latest.recordedAt, logs.length),
    },
    records: sortedLogs.slice(0, 20).map((log) => ({
      id: `log-${log.id}`,
      label: formatDetailDateTime(log.recordedAt),
      value: formatDetailLogRecordValue(log),
    })),
    chartData,
    donutData: kind === "diaper" ? buildDetailDonutData(logs, (log) => log.recordSubtype ?? log.value ?? "기록") : [],
  };
}

function buildGrowthDetailStats(
  config: DetailStatsConfig,
  measurements: GrowthMeasurementCard[],
  period: DetailStatsPeriod,
): DetailStatsViewModel {
  if (measurements.length === 0) {
    return emptyDetailStats(config);
  }

  const sortedMeasurements = [...measurements].sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt));
  const latest = sortedMeasurements[0];
  const chartData = buildDetailValueChartData(
    measurements
      .map((measurement) => ({
        timestamp: Date.parse(measurement.measuredAt),
        value: measurement.weightKg ?? measurement.heightCm ?? measurement.headCircumferenceCm ?? 0,
      }))
      .filter((item) => Number.isFinite(item.timestamp) && item.value > 0),
    period,
  );

  return {
    metric: {
      value: formatGrowthDetailMetric(latest),
      meta: formatDetailLatestMeta(latest.measuredAt, measurements.length),
    },
    records: sortedMeasurements.slice(0, 20).map((measurement) => ({
      id: `growth-${measurement.id}`,
      label: formatDetailDateTime(measurement.measuredAt),
      value: formatGrowthDetailRecord(measurement),
    })),
    chartData,
    donutData: [],
  };
}

function buildVaccinationDetailStats(
  config: DetailStatsConfig,
  vaccinations: VaccinationCard[],
  period: DetailStatsPeriod,
): DetailStatsViewModel {
  if (vaccinations.length === 0) {
    return emptyDetailStats(config);
  }

  const rows = vaccinations
    .map((vaccination) => ({
      record: vaccination,
      timestamp: Date.parse(vaccination.completedAt ?? vaccination.dueAt),
    }))
    .filter((item) => Number.isFinite(item.timestamp));
  const sortedRows = [...rows].sort((a, b) => b.timestamp - a.timestamp);
  const latest = sortedRows[0];

  return {
    metric: {
      value: `${vaccinations.length} 건`,
      meta: latest ? formatDetailLatestMeta(new Date(latest.timestamp).toISOString(), vaccinations.length) : "기록 없음",
    },
    records: sortedRows.slice(0, 20).map(({ record, timestamp }) => ({
      id: `vaccination-${record.id}`,
      label: formatDetailDateTime(new Date(timestamp).toISOString()),
      value: [record.name, record.doseLabel, vaccinationStatusLabel(record.status)].filter(Boolean).join(" · "),
    })),
    chartData: buildDetailCountChartData(rows, period),
    donutData: buildDetailDonutData(vaccinations, (vaccination) => vaccinationStatusLabel(vaccination.status)),
  };
}

function buildHospitalDetailStats(
  config: DetailStatsConfig,
  hospitalVisits: HospitalVisitCard[],
  period: DetailStatsPeriod,
): DetailStatsViewModel {
  if (hospitalVisits.length === 0) {
    return emptyDetailStats(config);
  }

  const rows = hospitalVisits
    .map((visit) => ({
      record: visit,
      timestamp: Date.parse(visit.visitedAt),
    }))
    .filter((item) => Number.isFinite(item.timestamp));
  const sortedRows = [...rows].sort((a, b) => b.timestamp - a.timestamp);
  const latest = sortedRows[0];

  return {
    metric: {
      value: `${hospitalVisits.length} 건`,
      meta: latest ? formatDetailLatestMeta(new Date(latest.timestamp).toISOString(), hospitalVisits.length) : "기록 없음",
    },
    records: sortedRows.slice(0, 20).map(({ record, timestamp }) => ({
      id: `hospital-${record.id}`,
      label: formatDetailDateTime(new Date(timestamp).toISOString()),
      value: [record.hospitalName, record.reason, record.diagnosis].filter(Boolean).join(" · "),
    })),
    chartData: buildDetailCountChartData(rows, period),
    donutData: [],
  };
}

function matchesDetailLogKind(kind: DetailStatsKind, log: LogCard) {
  switch (kind) {
    case "feeding":
      return log.type === "FEEDING";
    case "sleep":
      return log.type === "SLEEP";
    case "diaper":
      return log.type === "DIAPER" || log.type === "CHECKLIST";
    case "temperature":
      return log.type === "TEMPERATURE";
    case "medicine":
      return log.type === "MEDICINE";
    case "pumping":
      return log.type === "PUMPING";
    case "growth":
    case "vaccination":
    case "hospital":
      return false;
  }
}

function sortDetailLogs(logs: LogCard[]) {
  return [...logs].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
}

function formatDetailLogMetric(kind: DetailStatsKind, logs: LogCard[]) {
  switch (kind) {
    case "feeding":
    case "pumping": {
      const total = logs.reduce((sum, log) => sum + parseDetailNumericValue(log.value), 0);
      return `${formatDetailNumber(total)} ml`;
    }
    case "sleep": {
      const totalMinutes = logs.reduce((sum, log) => sum + parseDetailSleepMinutes(log), 0);
      return formatDetailDurationMinutes(totalMinutes);
    }
    case "diaper":
    case "medicine":
      return `${logs.length} 회`;
    case "temperature": {
      const values = logs.map((log) => parseDetailNumericValue(log.value)).filter((value) => value > 0);
      if (values.length === 0) {
        return "- ℃";
      }

      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      return `${formatDetailNumber(average)} ℃`;
    }
    case "growth":
    case "vaccination":
    case "hospital":
      return `${logs.length} 건`;
  }
}

function formatDetailLogRecordValue(log: LogCard) {
  const parts = [log.value || recordAlarmLabel(log.type), log.recordSubtype, log.note].filter(Boolean);
  return parts.join(" · ");
}

function buildDetailLogChartData(kind: DetailStatsKind, logs: LogCard[], period: DetailStatsPeriod) {
  const groups = new Map<string, { label: string; timestamp: number; total: number; count: number }>();

  logs.forEach((log) => {
    const timestamp = Date.parse(log.recordedAt);

    if (!Number.isFinite(timestamp)) {
      return;
    }

    const metric = detailChartMetricForLog(kind, log);

    if (metric == null || metric <= 0) {
      return;
    }

    const bucket = detailChartBucket(new Date(timestamp), period);
    const current = groups.get(bucket.key) ?? { label: bucket.label, timestamp: bucket.timestamp, total: 0, count: 0 };
    current.total += metric;
    current.count += 1;
    groups.set(bucket.key, current);
  });

  return [...groups.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((group) => ({
      label: group.label,
      timestamp: group.timestamp,
      value: kind === "temperature" ? Number((group.total / group.count).toFixed(1)) : Number(group.total.toFixed(1)),
    }));
}

function buildDetailCountChartData(records: Array<{ timestamp: number }>, period: DetailStatsPeriod) {
  const groups = new Map<string, { label: string; timestamp: number; total: number }>();

  records.forEach((record) => {
    const bucket = detailChartBucket(new Date(record.timestamp), period);
    const current = groups.get(bucket.key) ?? { label: bucket.label, timestamp: bucket.timestamp, total: 0 };
    current.total += 1;
    groups.set(bucket.key, current);
  });

  return [...groups.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((group) => ({
      label: group.label,
      timestamp: group.timestamp,
      value: group.total,
    }));
}

function buildDetailValueChartData(records: Array<{ timestamp: number; value: number }>, period: DetailStatsPeriod) {
  const groups = new Map<string, { label: string; timestamp: number; total: number; count: number }>();

  records.forEach((record) => {
    const bucket = detailChartBucket(new Date(record.timestamp), period);
    const current = groups.get(bucket.key) ?? { label: bucket.label, timestamp: bucket.timestamp, total: 0, count: 0 };
    current.total += record.value;
    current.count += 1;
    groups.set(bucket.key, current);
  });

  return [...groups.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((group) => ({
      label: group.label,
      timestamp: group.timestamp,
      value: Number((group.total / group.count).toFixed(1)),
    }));
}

function detailChartMetricForLog(kind: DetailStatsKind, log: LogCard) {
  switch (kind) {
    case "feeding":
    case "pumping":
    case "temperature":
      return parseDetailNumericValue(log.value);
    case "sleep":
      return Number((parseDetailSleepMinutes(log) / 60).toFixed(1));
    case "diaper":
    case "medicine":
      return 1;
    case "growth":
    case "vaccination":
    case "hospital":
      return null;
  }
}

function buildDetailDonutData<T>(records: T[], getLabel: (record: T) => string) {
  const colors = [primary, "#7ED3D0", "#9BE0D4", "#B7E8DF", "#CDEDE8"];
  const groups = new Map<string, number>();

  records.forEach((record) => {
    const label = getLabel(record).trim() || "기록";
    groups.set(label, (groups.get(label) ?? 0) + 1);
  });

  return [...groups.entries()].map(([label, value], index) => ({
    label,
    value,
    color: colors[index % colors.length],
  }));
}

function detailChartBucket(date: Date, period: DetailStatsPeriod) {
  if (period === "daily") {
    const bucketDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
    const hour = `${date.getHours()}`.padStart(2, "0");

    return {
      key: bucketDate.toISOString(),
      label: `${hour}시`,
      timestamp: bucketDate.getTime(),
    };
  }

  const bucketDate = startOfDetailDay(date);

  return {
    key: bucketDate.toISOString(),
    label: `${date.getMonth() + 1}/${date.getDate()}`,
    timestamp: bucketDate.getTime(),
  };
}

function startOfDetailDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDetailDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function detailDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function parseDetailNumericValue(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDetailSleepMinutes(log: LogCard) {
  if (log.recordedEndAt) {
    const startedAt = Date.parse(log.recordedAt);
    const endedAt = Date.parse(log.recordedEndAt);

    if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt > startedAt) {
      return Math.round((endedAt - startedAt) / 60000);
    }
  }

  const hourMatch = log.value.match(/(\d+(?:\.\d+)?)\s*시간/);
  const minuteMatch = log.value.match(/(\d+(?:\.\d+)?)\s*분/);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const total = hours * 60 + minutes;

  if (total > 0) {
    return total;
  }

  return parseDetailNumericValue(log.value);
}

function formatDetailDurationMinutes(totalMinutes: number) {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}시간 ${minutes}분`;
  }

  if (hours > 0) {
    return `${hours}시간`;
  }

  return `${minutes}분`;
}

function formatDetailNumber(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function formatDetailLatestMeta(value: string, count: number) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return `${count}건 · 최신 기록`;
  }

  return `${count}건 · ${formatDetailDateTime(value)} 최신 기록`;
}

function formatDetailDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "날짜 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function vaccinationStatusLabel(status: VaccinationCard["status"]) {
  switch (status) {
    case "COMPLETED":
      return "완료";
    case "SCHEDULED":
      return "예정";
    case "SKIPPED":
      return "건너뜀";
  }
}

function createRecordAlarmState(logType: LogType, rule?: RecordAlarmRuleCard | null): RecordAlarmFormState {
  return {
    enabled: rule?.enabled ?? false,
    minutes: String(rule?.intervalMinutes ?? defaultRecordAlarmMinutes[logType]),
    notifyScope: rule?.notifyScope ?? "FAMILY",
  };
}

function createRecordAlarmMap(rules: RecordAlarmRuleCard[] = []): RecordAlarmFormMap {
  const rulesByType = new Map(rules.map((rule) => [rule.logType, rule]));
  return Object.fromEntries(alarmLogTypes.map((logType) => [logType, createRecordAlarmState(logType, rulesByType.get(logType))]));
}

function createRecordReminderSettingsMap(rules: RecordAlarmRuleCard[], preferences: NotificationPreferencesSummary): RecordAlarmFormMap {
  const alarms = createRecordAlarmMap(rules);
  const feedingAlarm = recordAlarmStateFor(alarms, "FEEDING");
  const medicineAlarm = recordAlarmStateFor(alarms, "MEDICINE");

  return {
    ...alarms,
    FEEDING: { ...feedingAlarm, enabled: feedingAlarm.enabled && preferences.feedingEnabled },
    MEDICINE: { ...medicineAlarm, enabled: medicineAlarm.enabled && preferences.medicineEnabled },
  };
}

function recordAlarmStateFor(map: RecordAlarmFormMap, logType: LogType) {
  return map[logType] ?? createRecordAlarmState(logType);
}

function toRecordAlarmPayload(alarm: RecordAlarmFormState) {
  const parsedMinutes = Number(alarm.minutes.replace(/[^0-9]/g, ""));
  return {
    nextAlarmMinutes: alarm.enabled ? Math.max(Number.isFinite(parsedMinutes) ? parsedMinutes : 0, 5) : null,
    alarmNotifyScope: alarm.notifyScope,
  };
}

function toRecordSharePayload(share: RecordShareFormState) {
  return {
    shareWithFamily: share.enabled,
    excludedRecipientIds: share.excludedCaregiverIds,
  };
}

function useRecordShareForm() {
  const app = useBabyBossAppContext();
  const preference = app.settings?.recordSharePreference ?? null;
  const caregivers = app.settings?.caregivers ?? app.bootstrap?.caregivers ?? [];
  const [state, setState] = useState<RecordShareFormState>({
    enabled: false,
    excludedCaregiverIds: [],
  });
  const excludedKey = preference?.excludedCaregiverIds.join(",") ?? "";

  useEffect(() => {
    if (!preference) {
      return;
    }

    setState({
      enabled: preference.shareEnabled,
      excludedCaregiverIds: preference.excludedCaregiverIds,
    });
  }, [preference?.caregiverId, preference?.familyId, preference?.shareEnabled, excludedKey, preference?.updatedAt]);

  return {
    state,
    setState,
    caregivers,
    ready: preference !== null,
  };
}

async function createLogWithLocalRecordAlarm(familyId: number, payload: CreateLogRequest) {
  const log = await createLog(familyId, payload);

  if (typeof payload.nextAlarmMinutes === "number" && payload.nextAlarmMinutes > 0) {
    await scheduleLocalRecordAlarmNotification({
      logType: payload.type,
      intervalMinutes: payload.nextAlarmMinutes,
      recordedAt: payload.recordedAt,
      recordValue: payload.value,
    }).catch((error) => {
      console.warn("Failed to schedule local record alarm notification.", error);
    });
  }

  return log;
}

function RecordAlarmFields({
  logType,
  alarm,
  setAlarm,
}: {
  logType: LogType;
  alarm: RecordAlarmFormState;
  setAlarm: React.Dispatch<React.SetStateAction<RecordAlarmFormState>>;
}) {
  return (
    <View style={styles.alarmCard}>
      <ToggleRow
        title="다음 기록 알림"
        body={`${recordAlarmLabel(logType)} 기록 후 설정한 주기로 알림을 받아요.`}
        value={alarm.enabled}
        onValueChange={(enabled) => setAlarm((current) => ({ ...current, enabled }))}
        testID={`record-alarm-toggle-${logType.toLowerCase()}`}
      />
      {alarm.enabled ? (
        <>
          <Field label="알림 주기 (분)">
            <InputBox
              value={alarm.minutes}
              onChangeText={(minutes) => setAlarm((current) => ({ ...current, minutes }))}
              keyboardType="number-pad"
            />
          </Field>
          <Field label="알림 대상">
            <Segmented
              options={[
                {
                  label: "가족",
                  active: alarm.notifyScope === "FAMILY",
                  onPress: () => setAlarm((current) => ({ ...current, notifyScope: "FAMILY" })),
                },
                {
                  label: "나만",
                  active: alarm.notifyScope === "SELF",
                  onPress: () => setAlarm((current) => ({ ...current, notifyScope: "SELF" })),
                },
              ]}
            />
          </Field>
        </>
      ) : null}
    </View>
  );
}

function RecordAlarmSettingsCard({
  logType,
  alarm,
  setAlarm,
}: {
  logType: LogType;
  alarm: RecordAlarmFormState;
  setAlarm: React.Dispatch<React.SetStateAction<RecordAlarmFormState>>;
}) {
  const label = recordAlarmLabel(logType);

  return (
    <View style={styles.recordReminderGroup} testID={`record-alarm-card-${logType.toLowerCase()}`}>
      <ToggleRow
        icon={recordAlarmIcon(logType)}
        title={`${label} 리마인더`}
        body={alarm.enabled ? `다음 기록을 ${formatRecordAlarmInterval(alarm.minutes)} 알려드려요.` : `${label} 기록 리마인더가 꺼져 있어요.`}
        value={alarm.enabled}
        onValueChange={(enabled) => setAlarm((current) => ({ ...current, enabled }))}
        testID={`record-alarm-toggle-${logType.toLowerCase()}`}
      />
      {alarm.enabled ? (
        <View style={styles.recordReminderDetails}>
          <Field label={`${label} 알림 간격`}>
            <InputBox
              value={alarm.minutes}
              right={<Text style={styles.inputUnit}>분 후</Text>}
              onChangeText={(minutes) => setAlarm((current) => ({ ...current, minutes }))}
              keyboardType="number-pad"
              testID={`record-alarm-interval-${logType.toLowerCase()}`}
            />
          </Field>
          <Field label="수신 대상">
            <Segmented
              options={[
                {
                  label: "가족 모두",
                  active: alarm.notifyScope === "FAMILY",
                  onPress: () => setAlarm((current) => ({ ...current, notifyScope: "FAMILY" })),
                  testID: `record-alarm-scope-${logType.toLowerCase()}-family`,
                },
                {
                  label: "나만",
                  active: alarm.notifyScope === "SELF",
                  onPress: () => setAlarm((current) => ({ ...current, notifyScope: "SELF" })),
                  testID: `record-alarm-scope-${logType.toLowerCase()}-self`,
                },
              ]}
            />
          </Field>
        </View>
      ) : null}
    </View>
  );
}

function RecordShareFields({
  state,
  setState,
  caregivers,
  ready,
}: {
  state: RecordShareFormState;
  setState: React.Dispatch<React.SetStateAction<RecordShareFormState>>;
  caregivers: CaregiverSummary[];
  ready: boolean;
}) {
  const excludedIds = new Set(state.excludedCaregiverIds);

  function toggleExclusion(caregiverId: number) {
    setState((current) => {
      const currentIds = new Set(current.excludedCaregiverIds);

      if (currentIds.has(caregiverId)) {
        currentIds.delete(caregiverId);
      } else {
        currentIds.add(caregiverId);
      }

      return {
        ...current,
        excludedCaregiverIds: Array.from(currentIds),
      };
    });
  }

  return (
    <View style={styles.alarmCard}>
      <ToggleRow
        title="가족에게 등록 알림 보내기"
        body="기록을 저장하면 가족에게 등록 알림을 보내요."
        value={state.enabled}
        onValueChange={(enabled) => setState((current) => ({ ...current, enabled }))}
        disabled={!ready}
        testID="record-share-toggle"
      />
      {!ready ? <Text style={styles.recordShareLoading}>공유 설정을 불러오는 중이에요.</Text> : null}
      {ready && state.enabled ? (
        <View style={styles.recordShareRecipients}>
          <View style={styles.recordShareRecipientsHeader}>
            <Text style={styles.fieldLabel}>수신 대상 제외</Text>
            <Text style={styles.recordShareHint}>선택한 가족에게는 알림을 보내지 않아요.</Text>
          </View>
          <View style={styles.recordShareRecipientRow}>
            {caregivers.map((caregiver) => {
              const excluded = excludedIds.has(caregiver.id);
              return (
                <Pressable
                  key={caregiver.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: excluded }}
                  aria-checked={excluded}
                  aria-label={`${caregiver.name} 수신 제외`}
                  style={[styles.recordShareRecipientChip, excluded && styles.recordShareRecipientChipActive]}
                  onPress={() => toggleExclusion(caregiver.id)}
                  testID={`record-share-exclude-${caregiver.id}`}
                >
                  <Text style={[styles.recordShareRecipientText, excluded && styles.recordShareRecipientTextActive]}>
                    {excluded ? `${caregiver.name} 제외` : caregiver.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function recordAlarmLabel(logType: LogType) {
  switch (logType) {
    case "FEEDING":
      return "수유";
    case "SLEEP":
      return "수면";
    case "DIAPER":
      return "배변";
    case "TEMPERATURE":
      return "체온";
    case "MEDICINE":
      return "복약";
    case "PUMPING":
      return "유축";
    case "GROWTH":
      return "성장";
    case "MOMENT":
      return "메모";
    case "CHECKLIST":
      return "체크리스트";
    case "MEMO":
      return "메모";
  }
}

function recordAlarmIcon(logType: LogType): RecordIconName {
  switch (logType) {
    case "FEEDING":
      return "feeding";
    case "SLEEP":
      return "sleep";
    case "DIAPER":
      return "diaper";
    case "TEMPERATURE":
      return "temperature";
    case "MEDICINE":
      return "medicine";
    case "PUMPING":
      return "pumping";
    case "MEMO":
    case "MOMENT":
    case "CHECKLIST":
      return "memo";
    case "GROWTH":
      return "growth";
  }
}

function formatRecordAlarmInterval(minutes: string) {
  const parsedMinutes = Number(minutes.replace(/[^0-9]/g, ""));

  if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
    return "시간 미정";
  }

  const hours = Math.floor(parsedMinutes / 60);
  const remainingMinutes = parsedMinutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}시간 ${remainingMinutes}분 후`;
  }

  if (hours > 0) {
    return `${hours}시간 후`;
  }

  return `${parsedMinutes}분 후`;
}

function Header({
  title,
  action,
  actionTestID,
  destructive,
  onBack,
  onAction,
}: {
  title: string;
  action?: string;
  actionTestID?: string;
  destructive?: boolean;
  onBack: () => void;
  onAction?: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable style={[styles.headerSlot, styles.headerSlotLeft]} onPress={onBack} testID={`back-${slugify(title)}`}>
        <RecordIcon name="back-arrow" size={20} color="#1F2937" strokeWidth={2.1} />
      </Pressable>
      <View style={styles.headerCenter} pointerEvents="none">
        {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
      </View>
      {action ? (
        <Pressable style={[styles.headerSlot, styles.headerSlotRight]} onPress={onAction} testID={actionTestID}>
          <Text style={[styles.headerAction, destructive && styles.destructiveText]}>{action}</Text>
        </Pressable>
      ) : (
        <View style={[styles.headerSlot, styles.headerSlotRight]} />
      )}
    </View>
  );
}

function slugify(value: string) {
  return value.replace(/\s+/g, "-");
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function InputBox({
  value,
  placeholder,
  right,
  multiline,
  onChangeText,
  onSubmitEditing,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  testID,
}: {
  value?: string;
  placeholder?: string;
  right?: ReactNode;
  multiline?: boolean;
  onChangeText?: (value: string) => void;
  onSubmitEditing?: () => void;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  testID?: string;
}) {
  return (
    <View style={[styles.inputBox, multiline && styles.textAreaBox]}>
      <TextInput
        style={[styles.inputText, multiline && styles.textAreaText]}
        value={value}
        placeholder={placeholder}
        placeholderTextColor="#AEB7C5"
        multiline={multiline}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        editable={!value || Boolean(onChangeText)}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        testID={testID}
      />
      {right ? <View style={styles.inputRight}>{right}</View> : null}
    </View>
  );
}

function DateTimePickerField({
  value,
  onChange,
  title = "날짜/시간 선택",
  testID,
}: {
  value: string;
  onChange: (value: string) => void;
  title?: string;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateTimeValue(value);
  const [displayMonth, setDisplayMonth] = useState(selectedDate);
  const quickTimes = [
    [6, 0],
    [9, 0],
    [12, 0],
    [15, 0],
    [18, 0],
    [21, 0],
  ] as const;

  useEffect(() => {
    if (open) {
      setDisplayMonth(selectedDate);
    }
  }, [open, selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()]);

  return (
    <>
      <Pressable style={[styles.inputBox, styles.pickerInputBox]} onPress={() => setOpen(true)} testID={testID} accessibilityRole="button">
        <Text style={styles.pickerValueText}>{formatDateTimeLabel(value)}</Text>
        <View style={styles.inputRight}>
          <RecordIcon name="calendar" size={18} color="#64748B" />
        </View>
      </Pressable>
      <CalendarDatePickerOverlay
        visible={open}
        selectedDate={selectedDate}
        displayMonth={displayMonth}
        title={title}
        testID={`${testID}-picker`}
        onClose={() => setOpen(false)}
        onDisplayMonthChange={setDisplayMonth}
        onSelectDate={(date) => {
          onChange(mergeDatePart(value, date));
          setDisplayMonth(date);
        }}
        footer={
          <View style={styles.timePickerFooter}>
            <View style={styles.timePickerHeader}>
              <Text style={styles.timePickerLabel}>시간</Text>
              <Text style={styles.timePickerValue}>{formatClock(selectedDate)}</Text>
            </View>
            <View style={styles.timeStepperRow}>
              <Pressable style={styles.timeStepButton} onPress={() => onChange(adjustDateTimeMinutes(value, -10))}>
                <Text style={styles.timeStepText}>-10분</Text>
              </Pressable>
              <Pressable style={styles.timeStepButton} onPress={() => onChange(adjustDateTimeMinutes(value, 10))}>
                <Text style={styles.timeStepText}>+10분</Text>
              </Pressable>
            </View>
            <View style={styles.quickTimeRow}>
              {quickTimes.map(([hours, minutes]) => {
                const active = selectedDate.getHours() === hours && selectedDate.getMinutes() === minutes;
                return (
                  <Pressable
                    key={`${hours}:${minutes}`}
                    style={[styles.quickTimeChip, active && styles.quickTimeChipActive]}
                    onPress={() => onChange(setDateTimeClock(value, hours, minutes))}
                  >
                    <Text style={[styles.quickTimeText, active && styles.quickTimeTextActive]}>
                      {`${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.pickerDoneButton} onPress={() => setOpen(false)}>
              <Text style={styles.pickerDoneText}>확인</Text>
            </Pressable>
          </View>
        }
      />
    </>
  );
}

function DatePickerField({
  value,
  onChange,
  title = "날짜 선택",
  testID,
}: {
  value: string;
  onChange: (value: string) => void;
  title?: string;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateOnlyValue(value);
  const [displayMonth, setDisplayMonth] = useState(selectedDate);

  useEffect(() => {
    if (open) {
      setDisplayMonth(selectedDate);
    }
  }, [open, selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()]);

  return (
    <>
      <Pressable style={[styles.inputBox, styles.pickerInputBox]} onPress={() => setOpen(true)} testID={testID} accessibilityRole="button">
        <Text style={styles.pickerValueText}>{formatDateOnlyLabel(value)}</Text>
        <View style={styles.inputRight}>
          <RecordIcon name="calendar" size={18} color="#64748B" />
        </View>
      </Pressable>
      <CalendarDatePickerOverlay
        visible={open}
        selectedDate={selectedDate}
        displayMonth={displayMonth}
        title={title}
        testID={`${testID}-picker`}
        onClose={() => setOpen(false)}
        onDisplayMonthChange={setDisplayMonth}
        onSelectDate={(date) => {
          onChange(formatDateKey(date));
          setOpen(false);
        }}
      />
    </>
  );
}

function PrimaryButton({
  label,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable style={[styles.primaryButton, disabled && styles.disabledButton]} onPress={onPress} disabled={disabled} testID={testID} accessibilityRole="button">
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function OutlineButton({ label, danger, onPress }: { label: string; danger?: boolean; onPress?: () => void }) {
  return (
    <Pressable style={[styles.outlineButton, danger && styles.outlineDanger]} onPress={onPress}>
      <Text style={[styles.outlineButtonText, danger && styles.destructiveText]}>{label}</Text>
    </Pressable>
  );
}

function Segmented({ options }: { options: SegmentOption[] }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable key={option.label} style={[styles.segment, option.active && styles.segmentActive]}
                   onPress={option.onPress} disabled={!option.onPress} testID={option.testID}>
          <Text style={[styles.segmentText, option.active && styles.segmentTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ChipRow({
  labels,
  active = 0,
  onSelect,
}: {
  labels: string[];
  active?: number;
  onSelect?: (label: string, index: number) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {labels.map((label, index) => (
        <Pressable
          key={label}
          style={[styles.chip, active === index && styles.chipActive]}
          onPress={() => onSelect?.(label, index)}
          disabled={!onSelect}
        >
          <Text style={[styles.chipText, active === index && styles.chipTextActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function AddPhotoBox() {
  return (
    <View style={styles.photoAddBox}>
      <Text style={styles.photoAddText}>+</Text>
    </View>
  );
}

function ListRow({
  title,
  subtitle,
  badge,
  icon,
  onPress,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  icon?: RecordIconName;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.listRow} onPress={onPress}>
      {icon ? (
        <View style={styles.rowIcon}>
          <RecordIcon name={icon} size={24} />
        </View>
      ) : null}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <RecordIcon name="chevron-right" size={18} color="#94A3B8" />
    </Pressable>
  );
}

function ToggleRow({
  title,
  body,
  icon,
  value: initialValue,
  onValueChange,
  disabled = false,
  testID,
}: {
  title: string;
  body: string;
  icon?: RecordIconName;
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const currentValue = onValueChange ? initialValue : value;
  const progress = useRef(new Animated.Value(currentValue ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: currentValue ? 1 : 0,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [currentValue, progress]);

  const trackStyle = {
    backgroundColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: ["#EEF3F8", "#E7F6F3"],
    }),
    borderColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: ["#DDE5EF", "#A8D9D1"],
    }),
  };
  const thumbStyle = {
    backgroundColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: ["#FFFFFF", primary],
    }),
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 20],
        }),
      },
    ],
  };

  function handleValueChange(nextValue: boolean) {
    if (disabled) {
      return;
    }

    setValue(nextValue);
    onValueChange?.(nextValue);
  }

  return (
    <View style={[styles.toggleRow, currentValue && styles.toggleRowActive, disabled && styles.toggleRowDisabled]}>
      {icon ? (
        <View style={styles.toggleRowIcon}>
          <RecordIcon name={icon} size={28} />
        </View>
      ) : null}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{body}</Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: currentValue, disabled }}
        aria-checked={currentValue}
        aria-label={title}
        style={styles.toggleTrackHitArea}
        onPress={() => handleValueChange(!currentValue)}
        disabled={disabled}
        testID={testID}
      >
        <Animated.View style={[styles.toggleTrack, trackStyle]}>
          <Animated.View style={[styles.toggleThumb, thumbStyle]} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

function compactDetailChartData(data: DetailStatsPoint[]) {
  return data.length > 8 ? data.slice(-8) : data;
}

function detailChartMaxValue(data: DetailStatsPoint[]) {
  return Math.max(...data.map((item) => item.value), 1);
}

function StatBars({ data }: { data: DetailStatsPoint[] }) {
  const displayData = compactDetailChartData(data);
  const maxValue = detailChartMaxValue(displayData);

  if (Platform.OS !== "web") {
    return (
      <View style={styles.giftedChartWrap}>
        <GiftedBarChart
          data={displayData.map((item): barDataItem => ({ value: item.value, label: item.label }))}
          width={286}
          height={194}
          maxValue={maxValue}
          noOfSections={4}
          barWidth={Math.max(10, Math.min(18, Math.floor(150 / Math.max(displayData.length, 1))))}
          spacing={Math.max(8, Math.floor(130 / Math.max(displayData.length, 1)))}
          initialSpacing={8}
          endSpacing={0}
          roundedTop
          disablePress
          disableScroll
          focusBarOnPress={false}
          isAnimated={false}
          frontColor="#78C9BF"
          rulesColor="#EAF2EF"
          rulesThickness={1}
          xAxisColor="#DDE7E2"
          yAxisColor="transparent"
          yAxisLabelWidth={24}
          yAxisTextStyle={styles.chartAxisText}
          xAxisLabelTextStyle={styles.chartAxisText}
          hideOrigin
        />
      </View>
    );
  }

  const baseline = 202;
  const chartHeight = 148;
  const xStart = 44;
  const xEnd = 260;
  const step = displayData.length > 1 ? (xEnd - xStart) / (displayData.length - 1) : 0;
  const barWidth = Math.max(10, Math.min(18, Math.floor(120 / Math.max(displayData.length, 1))));

  return (
    <View style={styles.barChart}>
      <Svg width="100%" height="100%" viewBox="0 0 300 230">
        {[42, 82, 122, 162, 202].map((y) => (
          <Line key={y} x1="22" y1={y} x2="282" y2={y} stroke="#EAF2EF" strokeWidth="1" />
        ))}
        {displayData.map((item, index) => {
          const centerX = displayData.length > 1 ? xStart + index * step : 150;
          const height = Math.max(Math.round((item.value / maxValue) * chartHeight), 4);
          return (
            <Rect
              key={`${item.timestamp}-${item.label}`}
              x={centerX - barWidth / 2}
              y={baseline - height}
              width={barWidth}
              height={height}
              rx="5"
              fill="#78C9BF"
            />
          );
        })}
        {displayData.map((item, index) => {
          const centerX = displayData.length > 1 ? xStart + index * step : 150;
          const height = Math.max(Math.round((item.value / maxValue) * chartHeight), 4);
          return (
            <SvgText key={`${item.timestamp}-${item.label}-value`} x={centerX} y={baseline - height - 8} fill="#7E94C8" fontSize="10" fontWeight="600" fontFamily={FONT_FAMILY} textAnchor="middle">
              {formatDetailNumber(item.value)}
            </SvgText>
          );
        })}
        {displayData.map((item, index) => (
          <SvgText key={`${item.timestamp}-${item.label}-label`} x={displayData.length > 1 ? xStart + index * step : 150} y="222" fill="#8A94A8" fontSize="10" fontWeight="600" fontFamily={FONT_FAMILY} textAnchor="middle">
            {item.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function LineChartLite({ data }: { data: DetailStatsPoint[] }) {
  const displayData = compactDetailChartData(data);
  const maxValue = detailChartMaxValue(displayData);

  if (Platform.OS !== "web") {
    return (
      <View style={styles.giftedChartWrap}>
        <GiftedLineChart
          data={displayData.map((item): lineDataItem => ({ value: item.value, label: item.label }))}
          width={286}
          height={194}
          maxValue={maxValue}
          noOfSections={3}
          spacing={Math.max(24, Math.floor(220 / Math.max(displayData.length, 1)))}
          initialSpacing={8}
          endSpacing={0}
          disableScroll
          focusEnabled={false}
          pointerConfig={{ pointerEvents: "none" }}
          isAnimated={false}
          curved
          thickness={3}
          color={primary}
          areaChart
          startFillColor="#CDEDE8"
          endFillColor="#FFFFFF"
          startOpacity={0.65}
          endOpacity={0.05}
          dataPointsRadius={3.5}
          dataPointsColor={primary}
          rulesColor="#EAF2EF"
          rulesThickness={1}
          xAxisColor="#DDE7E2"
          yAxisColor="transparent"
          yAxisLabelWidth={24}
          yAxisTextStyle={styles.chartAxisText}
          xAxisLabelTextStyle={styles.chartAxisText}
          hideOrigin
        />
      </View>
    );
  }

  const baseline = 198;
  const chartHeight = 148;
  const xStart = 32;
  const xEnd = 260;
  const step = displayData.length > 1 ? (xEnd - xStart) / (displayData.length - 1) : 0;
  const coordinates = displayData.map((item, index) => ({
    item,
    x: displayData.length > 1 ? xStart + index * step : 150,
    y: baseline - (item.value / maxValue) * chartHeight,
  }));
  const points = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const firstX = coordinates[0]?.x ?? xStart;
  const lastX = coordinates[coordinates.length - 1]?.x ?? xEnd;

  return (
    <View style={styles.lineChartLite}>
      <Svg width="100%" height="100%" viewBox="0 0 300 230">
        {[46, 86, 126, 166, 198].map((y) => (
          <Line key={y} x1="24" y1={y} x2="282" y2={y} stroke="#EAF2EF" strokeWidth="1" />
        ))}
        <Path d={`M${firstX},198 ${points} L${lastX},198 Z`} fill="#E7F6F3" opacity="0.62" />
        <Polyline points={points} fill="none" stroke={primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {coordinates.map((point) => (
          <Circle key={`${point.item.timestamp}-${point.item.label}`} cx={point.x} cy={point.y} r="4" fill={primary} stroke="#FFFFFF" strokeWidth="2" />
        ))}
        {coordinates.map((point) => (
          <SvgText key={`${point.item.timestamp}-${point.item.label}-label`} x={point.x} y="222" fill="#8A94A8" fontSize="10" fontWeight="600" fontFamily={FONT_FAMILY} textAnchor="middle">
            {point.item.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function DonutChartLite({ segments }: { segments: DetailStatsDonutSegment[] }) {
  return (
    <View style={styles.donutRow}>
      {Platform.OS !== "web" ? (
        <GiftedPieChart
          data={segments.map((segment): pieDataItem => ({ value: segment.value, color: segment.color }))}
          donut
          radius={72}
          innerRadius={42}
          innerCircleColor="#FFFFFF"
          strokeWidth={3}
          strokeColor="#FFFFFF"
          isAnimated={false}
        />
      ) : (
        <DonutSvg segments={segments} />
      )}
      <View style={styles.legend}>
        {segments.map((segment) => (
          <LegendDot key={segment.label} color={segment.color} label={`${segment.label} ${segment.value}회`} />
        ))}
      </View>
    </View>
  );
}

function DonutSvg({ segments }: { segments: DetailStatsDonutSegment[] }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const total = Math.max(segments.reduce((sum, segment) => sum + segment.value, 0), 1);
  let dashOffset = 0;

  return (
    <Svg width={148} height={148} viewBox="0 0 148 148">
      <Circle cx="74" cy="74" r={radius} fill="none" stroke="#E7F6F3" strokeWidth="28" />
      {segments.map((segment) => {
        const dash = circumference * (segment.value / total);
        const offset = dashOffset;
        dashOffset += dash;
        return (
          <Circle
            key={segment.label}
            cx="74"
            cy="74"
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth="28"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform="rotate(-90 74 74)"
          />
        );
      })}
      <Circle cx="74" cy="74" r="38" fill="#FFFFFF" />
    </Svg>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

export function FamilyInviteRoute() {
  const back = useFallbackBack("/settings");
  const action = useSpecAction("초대를 보냈어요.");
  const [email, setEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [role, setRole] = useState<CaregiverRole>("GUARDIAN");
  const [note, setNote] = useState("");
  const canInvite = Boolean(email.trim() && contactPhone.trim()) && !action.busy;
  const save = () =>
    action.run((session) =>
      createFamilyInvitation(session.family.id, {
        email,
        contactPhone,
        role,
        note,
      }),
    );

  return (
    <SpecShell testID="screen-family-invite">
      <Header title="가족 초대" action="취소" onBack={back} onAction={back} />
      <Field label="이메일">
        <InputBox value={email} placeholder="이메일을 입력하세요" onChangeText={setEmail} keyboardType="email-address" testID="family-invite-email" />
      </Field>
      <Field label="연락처">
        <InputBox value={contactPhone} placeholder="연락처를 입력하세요" onChangeText={setContactPhone} keyboardType="phone-pad" testID="family-invite-contact-phone" />
      </Field>
      <Field label="역할">
        <Segmented
          options={caregiverRoleOptions.map((item) => ({
            label: roleLabel[item],
            active: role === item,
            onPress: () => setRole(item),
            testID: `family-invite-role-${item}`,
          }))}
        />
      </Field>
      <Field label="메모 (선택)">
        <InputBox value={note} placeholder="메모를 입력하세요" multiline onChangeText={setNote} />
      </Field>
      <PrimaryButton label="초대 보내기" onPress={save} disabled={!canInvite} testID="family-invite-submit" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function FamilyManagementRoute() {
  const router = useRouter();
  const back = useFallbackBack("/settings");
  const [caregivers, setCaregivers] = useState<CaregiverSummary[]>([]);
  const [invitations, setInvitations] = useState<FamilyInvitationCard[]>([]);
  const [loadMessage, setLoadMessage] = useState<string | null>("가족 정보를 불러오는 중...");

  useEffect(() => {
    let isActive = true;

    async function loadFamily() {
      try {
        const session = await restoreSession();
        const [settings, nextInvitations] = await Promise.all([
          fetchSettings(session.family.id),
          fetchFamilyInvitations(session.family.id),
        ]);

        if (isActive) {
          setCaregivers(settings.caregivers);
          setInvitations(nextInvitations);
          setLoadMessage(null);
        }
      } catch (error) {
        if (isActive) {
          setLoadMessage(error instanceof Error ? error.message : "가족 정보를 불러오지 못했어요.");
        }
      }
    }

    void loadFamily();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <SpecShell testID="screen-family-management">
      <Header title="가족 관리" action="추가" onBack={back} onAction={() => router.push("/family-invite")} />
      <Text style={styles.sectionLabel}>가족 구성원</Text>
      {caregivers.map((caregiver) => (
        <MemberRow
          key={caregiver.id}
          name={caregiver.name}
          subtitle="가족 구성원"
          badge={caregiver.imageUrl ? "프로필" : "연결됨"}
          imageUrl={caregiver.imageUrl}
        />
      ))}
      {invitations.length > 0 ? <Text style={styles.sectionLabel}>초대 목록</Text> : null}
      {invitations.map((invitation) => (
        <MemberRow
          key={invitation.id}
          name={invitation.email}
          subtitle={[roleLabel[invitation.role], invitation.contactPhone, invitation.note].filter(Boolean).join(" · ")}
          badge={invitationStatusLabel(invitation.status)}
        />
      ))}
      <ActionStatus message={loadMessage} />
      <OutlineButton label="가족 나가기" danger />
    </SpecShell>
  );
}

function MemberRow({ name, subtitle, badge, imageUrl }: { name: string; subtitle: string; badge: string; imageUrl?: string | null }) {
  return (
    <View style={styles.memberRow}>
      <ProfileImageField size={36} imageUrl={imageUrl} editable={false} />
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{name}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
    </View>
  );
}

export function ChildInfoRoute() {
  const back = useFallbackBack("/settings");
  const app = useBabyBossAppContext();
  const action = useSpecAction("아이 정보를 저장했어요.");
  const sessionChild = app.session?.child ?? null;
  const [loadedChild, setLoadedChild] = useState(() => sessionChild);
  const [name, setName] = useState(() => sessionChild?.name ?? "");
  const [birthDate, setBirthDate] = useState(() => sessionChild?.birthDate ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(() => sessionChild?.imageUrl ?? null);

  useEffect(() => {
    let isActive = true;

    async function loadChild() {
      try {
        const session = app.session ?? await restoreSession();
        const child = session?.child ?? null;

        if (isActive && child) {
          setLoadedChild(child);
          setName(child.name);
          setBirthDate(child.birthDate);
          setImageUrl(child.imageUrl ?? null);
        }
      } catch {
        // 로그인 전 접근은 저장 시점의 세션 확인에서 처리한다.
      }
    }

    void loadChild();

    return () => {
      isActive = false;
    };
  }, [app.session, sessionChild]);

  const canSave = Boolean(loadedChild && name.trim() && isValidDateOnlyValue(birthDate)) && !action.busy;

  const save = () => {
    if (!canSave) {
      return;
    }

    return action.run(async (session) => {
      await updateChildProfile(requireSessionChild(session).id, {
        name,
        birthDate,
        imageUrl,
      });
      await app.refreshAll();
    });
  };

  function handleImageChange(nextImageUrl: string | null) {
    setImageUrl(nextImageUrl);
    void action.run(async (session) => {
      await updateChildProfile(requireSessionChild(session).id, {
        name,
        birthDate,
        imageUrl: nextImageUrl,
      });
      await app.refreshAll();
    });
  }

  return (
    <SpecShell testID="screen-child-info">
      <Header title="아이 정보" onBack={back} />
      <View style={styles.centerPhotoBlock}>
        <ProfileImageField size={88} imageUrl={imageUrl} onChangeImage={handleImageChange} testID="child-profile-image" />
        <View style={styles.childDdayPill} testID="child-info-dday">
          <Text style={styles.childDdayText}>{isValidDateOnlyValue(birthDate) ? `생후 ${formatChildDday(birthDate)}` : "생년월일을 입력해 주세요."}</Text>
        </View>
      </View>
      <Field label="이름">
        <InputBox value={name} onChangeText={setName} testID="child-info-name-input" />
      </Field>
      <Field label="생년월일">
        <DatePickerField value={birthDate} onChange={setBirthDate} title="생년월일 선택" testID="child-birth-date-picker" />
      </Field>
      <PrimaryButton label="저장" onPress={save} disabled={!canSave} />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function FeedingAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("수유 기록을 저장했어요.", "/timeline");
  const [amount, setAmount] = useState("");
  const [methodIndex, setMethodIndex] = useState<number | null>(null);
  const [recordedAt, setRecordedAt] = useState(() => toDateTimeInputValue());
  const [note, setNote] = useState("");
  const [alarm, setAlarm] = useState(() => createRecordAlarmState("FEEDING"));
  const recordShare = useRecordShareForm();
  const methodOptions = ["분유", "모유", "이유식"];
  const amountMl = parseMeasurement(amount);
  const method = methodIndex === null ? null : methodOptions[methodIndex];
  const canSave = Boolean(amountMl && amountMl > 0 && method) && recordShare.ready && !action.busy;
  const save = () => {
    if (!canSave || !method) {
      return;
    }

    return action.run((session) =>
      createLogWithLocalRecordAlarm(session.family.id, {
        type: "FEEDING",
        value: formatMlValue(amount),
        note,
        childId: requireSessionChild(session).id,
        recordedAt: toRecordedAt(recordedAt),
        recordSubtype: method,
        details: { amountMl, method },
        ...toRecordSharePayload(recordShare.state),
        ...toRecordAlarmPayload(alarm),
      }),
    );
  };

  return (
    <SpecShell testID="screen-feeding-add">
      <Header title="수유" onBack={back} />
      <Field label="수유량">
        <InputBox value={amount} onChangeText={setAmount} keyboardType="decimal-pad" right={<Text style={styles.inputUnit}>ml</Text>} testID="feeding-amount-input" />
      </Field>
      <Field label="수유 방법">
        <ChipRow labels={methodOptions} active={methodIndex ?? -1} onSelect={(_, index) => setMethodIndex(index)} />
      </Field>
      <Field label="기록 시간">
        <DateTimePickerField value={recordedAt} onChange={setRecordedAt} title="수유 시간 선택" testID="feeding-recorded-at-picker" />
      </Field>
      <Field label="메모 (선택)">
        <InputBox value={note} placeholder="메모를 입력하세요" multiline onChangeText={setNote} />
      </Field>
      <RecordShareFields {...recordShare} />
      <RecordAlarmFields logType="FEEDING" alarm={alarm} setAlarm={setAlarm} />
      <PrimaryButton label={action.busy ? "저장 중..." : "기록 저장"} onPress={save} disabled={!canSave} testID="feeding-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function SleepAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("수면 기록을 저장했어요.", "/timeline");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [sleepTypeIndex, setSleepTypeIndex] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [alarm, setAlarm] = useState(() => createRecordAlarmState("SLEEP"));
  const recordShare = useRecordShareForm();
  const sleepTypeOptions = ["낮잠", "밤잠"];
  const sleepType = sleepTypeIndex === null ? null : sleepTypeOptions[sleepTypeIndex];
  const canSave = Boolean(sleepType && isValidDateTimeValue(startAt) && isValidDateTimeValue(endAt)) && recordShare.ready && !action.busy;
  const save = () => {
    if (!canSave || !sleepType) {
      return;
    }

    return action.run((session) => {
      const startedAt = toRecordedAt(startAt);
      const endedAtDate = parseDateTimeValue(endAt);

      if (Date.parse(endedAtDate.toISOString()) <= Date.parse(startedAt)) {
        endedAtDate.setDate(endedAtDate.getDate() + 1);
      }

      const endedAt = endedAtDate.toISOString();
      return createLogWithLocalRecordAlarm(session.family.id, {
        type: "SLEEP",
        value: durationLabel(startedAt, endedAt),
        note,
        childId: requireSessionChild(session).id,
        recordedAt: startedAt,
        recordedEndAt: endedAt,
        recordSubtype: sleepType,
        details: { sleepType },
        ...toRecordSharePayload(recordShare.state),
        ...toRecordAlarmPayload(alarm),
      });
    });
  };

  return (
    <SpecShell testID="screen-sleep-add">
      <Header title="수면" onBack={back} />
      <Field label="시작 시간">
        <DateTimePickerField value={startAt} onChange={setStartAt} title="수면 시작 시간 선택" testID="sleep-start-at-picker" />
      </Field>
      <Field label="종료 시간">
        <DateTimePickerField value={endAt} onChange={setEndAt} title="수면 종료 시간 선택" testID="sleep-end-at-picker" />
      </Field>
      <Field label="수면 유형">
        <Segmented options={sleepTypeOptions.map((label, index) => ({ label, active: sleepTypeIndex === index, onPress: () => setSleepTypeIndex(index) }))} />
      </Field>
      <Field label="메모 (선택)">
        <InputBox value={note} placeholder="메모를 입력하세요" multiline onChangeText={setNote} />
      </Field>
      <RecordShareFields {...recordShare} />
      <RecordAlarmFields logType="SLEEP" alarm={alarm} setAlarm={setAlarm} />
      <PrimaryButton label={action.busy ? "저장 중..." : "기록 저장"} onPress={save} disabled={!canSave} testID="sleep-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function DiaperAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("배변 기록을 저장했어요.", "/timeline");
  const [statusIndex, setStatusIndex] = useState<number | null>(null);
  const [colorIndex, setColorIndex] = useState<number | null>(null);
  const [recordedAt, setRecordedAt] = useState(() => toDateTimeInputValue());
  const [note, setNote] = useState("");
  const [alarm, setAlarm] = useState(() => createRecordAlarmState("DIAPER"));
  const recordShare = useRecordShareForm();
  const statusOptions = ["정상", "묽음", "딱딱함"];
  const colorOptions = ["갈색", "노란색", "초록색", "기타"];
  const status = statusIndex === null ? null : statusOptions[statusIndex];
  const color = colorIndex === null ? null : colorOptions[colorIndex];
  const canSave = Boolean(status) && recordShare.ready && !action.busy;
  const save = () => {
    if (!canSave || !status) {
      return;
    }

    return action.run((session) =>
      createLogWithLocalRecordAlarm(session.family.id, {
        type: "DIAPER",
        value: status,
        note,
        childId: requireSessionChild(session).id,
        recordedAt: toRecordedAt(recordedAt),
        recordSubtype: status,
        details: { status, color },
        ...toRecordSharePayload(recordShare.state),
        ...toRecordAlarmPayload(alarm),
      }),
    );
  };

  return (
    <SpecShell testID="screen-diaper-add">
      <Header title="배변" onBack={back} />
      <Field label="배변 상태">
        <ChipRow labels={statusOptions} active={statusIndex ?? -1} onSelect={(_, index) => setStatusIndex(index)} />
      </Field>
      <Field label="색상 (선택)">
        <ChipRow labels={colorOptions} active={colorIndex ?? -1} onSelect={(_, index) => setColorIndex(index)} />
      </Field>
      <Field label="기록 시간">
        <DateTimePickerField value={recordedAt} onChange={setRecordedAt} title="배변 시간 선택" testID="diaper-recorded-at-picker" />
      </Field>
      <Field label="메모 (선택)">
        <InputBox value={note} placeholder="메모를 입력하세요" onChangeText={setNote} />
      </Field>
      <RecordShareFields {...recordShare} />
      <RecordAlarmFields logType="DIAPER" alarm={alarm} setAlarm={setAlarm} />
      <PrimaryButton label={action.busy ? "저장 중..." : "기록 저장"} onPress={save} disabled={!canSave} testID="diaper-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function TemperatureAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("체온 기록을 저장했어요.", "/timeline");
  const [temperature, setTemperature] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => toDateTimeInputValue());
  const [note, setNote] = useState("");
  const [alarm, setAlarm] = useState(() => createRecordAlarmState("TEMPERATURE"));
  const recordShare = useRecordShareForm();
  const celsius = parseMeasurement(temperature);
  const canSave = Boolean(celsius && celsius > 0) && recordShare.ready && !action.busy;
  const save = () => {
    if (!canSave || celsius === null) {
      return;
    }

    return action.run((session) =>
      createLogWithLocalRecordAlarm(session.family.id, {
        type: "TEMPERATURE",
        value: `${temperature}℃`,
        note,
        childId: requireSessionChild(session).id,
        recordedAt: toRecordedAt(recordedAt),
        details: { celsius },
        ...toRecordSharePayload(recordShare.state),
        ...toRecordAlarmPayload(alarm),
      }),
    );
  };

  return (
    <SpecShell testID="screen-temperature-add">
      <Header title="체온" onBack={back} />
      <Text style={styles.fieldLabel}>체온</Text>
      <View style={styles.temperatureControl}>
        <Text style={styles.roundStep}>-</Text>
        <TextInput style={styles.temperatureValue} value={temperature} onChangeText={setTemperature} keyboardType="decimal-pad" />
        <Text style={styles.roundStep}>+</Text>
      </View>
      <Field label="측정 시간">
        <DateTimePickerField value={recordedAt} onChange={setRecordedAt} title="체온 측정 시간 선택" testID="temperature-recorded-at-picker" />
      </Field>
      <Field label="메모 (선택)">
        <InputBox value={note} placeholder="메모를 입력하세요" onChangeText={setNote} />
      </Field>
      <RecordShareFields {...recordShare} />
      <RecordAlarmFields logType="TEMPERATURE" alarm={alarm} setAlarm={setAlarm} />
      <PrimaryButton label={action.busy ? "저장 중..." : "기록 저장"} onPress={save} disabled={!canSave} testID="temperature-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function MedicineAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("복약 기록을 저장했어요.", "/timeline");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => toDateTimeInputValue());
  const [note, setNote] = useState("");
  const [alarm, setAlarm] = useState(() => createRecordAlarmState("MEDICINE"));
  const recordShare = useRecordShareForm();
  const canSave = Boolean(name.trim() && amount.trim()) && recordShare.ready && !action.busy;
  const save = () => {
    if (!canSave) {
      return;
    }

    return action.run((session) =>
      createLogWithLocalRecordAlarm(session.family.id, {
        type: "MEDICINE",
        value: `${name} ${amount}`.trim(),
        note,
        childId: requireSessionChild(session).id,
        recordedAt: toRecordedAt(recordedAt),
        recordSubtype: name,
        details: { name, amount },
        ...toRecordSharePayload(recordShare.state),
        ...toRecordAlarmPayload(alarm),
      }),
    );
  };

  return (
    <SpecShell testID="screen-medicine-add">
      <Header title="약/영양제" onBack={back} />
      <Field label="약/영양제 이름">
        <InputBox value={name} onChangeText={setName} />
      </Field>
      <Field label="용량">
        <InputBox value={amount} onChangeText={setAmount} />
      </Field>
      <Field label="복용 시간">
        <DateTimePickerField value={recordedAt} onChange={setRecordedAt} title="복용 시간 선택" testID="medicine-recorded-at-picker" />
      </Field>
      <Field label="메모 (선택)">
        <InputBox value={note} placeholder="메모를 입력하세요" multiline onChangeText={setNote} />
      </Field>
      <RecordShareFields {...recordShare} />
      <RecordAlarmFields logType="MEDICINE" alarm={alarm} setAlarm={setAlarm} />
      <PrimaryButton label={action.busy ? "저장 중..." : "기록 저장"} onPress={save} disabled={!canSave} testID="medicine-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function PumpingAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("유축 기록을 저장했어요.", "/timeline");
  const [sideIndex, setSideIndex] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => toDateTimeInputValue());
  const [note, setNote] = useState("");
  const [alarm, setAlarm] = useState(() => createRecordAlarmState("PUMPING"));
  const recordShare = useRecordShareForm();
  const sideOptions = ["왼쪽", "오른쪽", "양쪽"];
  const amountMl = parseMeasurement(amount);
  const side = sideIndex === null ? null : sideOptions[sideIndex];
  const canSave = Boolean(amountMl && amountMl > 0 && side) && recordShare.ready && !action.busy;
  const save = () => {
    if (!canSave || !side) {
      return;
    }

    return action.run((session) =>
      createLogWithLocalRecordAlarm(session.family.id, {
        type: "PUMPING",
        value: `${side} ${formatMlValue(amount)}`,
        note,
        childId: requireSessionChild(session).id,
        recordedAt: toRecordedAt(recordedAt),
        recordSubtype: side,
        details: { side, amountMl },
        ...toRecordSharePayload(recordShare.state),
        ...toRecordAlarmPayload(alarm),
      }),
    );
  };

  return (
    <SpecShell testID="screen-pumping-add">
      <Header title="유축" onBack={back} />
      <Field label="유축 방향">
        <ChipRow labels={sideOptions} active={sideIndex ?? -1} onSelect={(_, index) => setSideIndex(index)} />
      </Field>
      <Field label="유축량">
        <InputBox value={amount} onChangeText={setAmount} keyboardType="decimal-pad" right={<Text style={styles.inputUnit}>ml</Text>} />
      </Field>
      <Field label="기록 시간">
        <DateTimePickerField value={recordedAt} onChange={setRecordedAt} title="유축 시간 선택" testID="pumping-recorded-at-picker" />
      </Field>
      <Field label="메모 (선택)">
        <InputBox value={note} placeholder="내용을 입력하세요" multiline onChangeText={setNote} />
      </Field>
      <Field label="사진 (선택)">
        <AddPhotoBox />
      </Field>
      <RecordShareFields {...recordShare} />
      <RecordAlarmFields logType="PUMPING" alarm={alarm} setAlarm={setAlarm} />
      <PrimaryButton label={action.busy ? "저장 중..." : "기록 저장"} onPress={save} disabled={!canSave} testID="pumping-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function MemoAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("메모를 저장했어요.", "/timeline");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => toDateTimeInputValue());
  const [alarm, setAlarm] = useState(() => createRecordAlarmState("MEMO"));
  const recordShare = useRecordShareForm();
  const canSave = Boolean(title.trim()) && recordShare.ready && !action.busy;
  const save = () => {
    if (!canSave) {
      return;
    }

    return action.run((session) =>
      createLogWithLocalRecordAlarm(session.family.id, {
        type: "MEMO",
        value: title,
        note: body,
        childId: requireSessionChild(session).id,
        recordedAt: toRecordedAt(recordedAt),
        recordSubtype: title,
        details: { title },
        ...toRecordSharePayload(recordShare.state),
        ...toRecordAlarmPayload(alarm),
      }),
    );
  };

  return (
    <SpecShell testID="screen-memo-add">
      <Header title="메모" onBack={back} />
      <Field label="제목">
        <InputBox value={title} onChangeText={setTitle} />
      </Field>
      <Field label="내용">
        <InputBox value={body} placeholder="내용을 입력하세요" multiline onChangeText={setBody} />
      </Field>
      <Field label="기록 시간">
        <DateTimePickerField value={recordedAt} onChange={setRecordedAt} title="메모 시간 선택" testID="memo-recorded-at-picker" />
      </Field>
      <Field label="사진 (선택)">
        <AddPhotoBox />
      </Field>
      <RecordShareFields {...recordShare} />
      <RecordAlarmFields logType="MEMO" alarm={alarm} setAlarm={setAlarm} />
      <PrimaryButton label={action.busy ? "저장 중..." : "기록 저장"} onPress={save} disabled={!canSave} testID="memo-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function VaccinationAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("예방접종 기록을 저장했어요.", "/vaccinations");
  const [name, setName] = useState("");
  const [doseLabel, setDoseLabel] = useState("");
  const [statusIndex, setStatusIndex] = useState(0);
  const [vaccinatedAt, setVaccinatedAt] = useState(() => toDateTimeInputValue());
  const [note, setNote] = useState("");
  const recordShare = useRecordShareForm();
  const statusOptions: { label: string; value: VaccinationCard["status"] }[] = [
    { label: "예정", value: "SCHEDULED" },
    { label: "완료", value: "COMPLETED" },
    { label: "건너뜀", value: "SKIPPED" },
  ];
  const status = statusOptions[statusIndex].value;
  const canSave = Boolean(name.trim()) && recordShare.ready && !action.busy;
  const save = () =>
    action.run((session) =>
      createVaccination(session.family.id, {
        childId: requireSessionChild(session).id,
        name,
        doseLabel,
        status,
        dueAt: toRecordedAt(vaccinatedAt),
        completedAt: status === "COMPLETED" ? toRecordedAt(vaccinatedAt) : null,
        note,
        ...toRecordSharePayload(recordShare.state),
      }),
    );

  return (
    <SpecShell testID="screen-vaccination-add">
      <Header title="예방접종" onBack={back} />
      <Field label="접종명">
        <InputBox value={name} placeholder="예: BCG" onChangeText={setName} />
      </Field>
      <Field label="차수 (선택)">
        <InputBox value={doseLabel} placeholder="예: 1차" onChangeText={setDoseLabel} />
      </Field>
      <Field label="접종일">
        <DateTimePickerField value={vaccinatedAt} onChange={setVaccinatedAt} title="접종일 선택" testID="vaccination-date-picker" />
      </Field>
      <Field label="접종 상태">
        <Segmented options={statusOptions.map((option, index) => ({ label: option.label, active: statusIndex === index, onPress: () => setStatusIndex(index) }))} />
      </Field>
      <Field label="메모 (선택)">
        <InputBox value={note} placeholder="메모를 입력하세요" multiline onChangeText={setNote} />
      </Field>
      <RecordShareFields {...recordShare} />
      <PrimaryButton label={action.busy ? "저장 중..." : "기록 저장"} onPress={save} disabled={!canSave} testID="vaccination-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function HospitalAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("병원 방문 기록을 저장했어요.", "/hospital-visits");
  const [hospitalName, setHospitalName] = useState("");
  const [reason, setReason] = useState("");
  const [visitedAt, setVisitedAt] = useState(() => toDateTimeInputValue());
  const [diagnosis, setDiagnosis] = useState("");
  const [note, setNote] = useState("");
  const recordShare = useRecordShareForm();
  const canSave = Boolean(hospitalName.trim()) && recordShare.ready && !action.busy;
  const save = () =>
    action.run((session) =>
      createHospitalVisit(session.family.id, {
        childId: requireSessionChild(session).id,
        hospitalName,
        reason,
        visitedAt: toRecordedAt(visitedAt),
        diagnosis,
        note,
        ...toRecordSharePayload(recordShare.state),
      }),
    );

  return (
    <SpecShell testID="screen-hospital-add">
      <Header title="병원 방문" onBack={back} />
      <Field label="병원명">
        <InputBox value={hospitalName} placeholder="병원명을 입력하세요" onChangeText={setHospitalName} />
      </Field>
      <Field label="방문 사유">
        <InputBox value={reason} placeholder="예: 정기검진, 감기" onChangeText={setReason} />
      </Field>
      <Field label="방문일">
        <DateTimePickerField value={visitedAt} onChange={setVisitedAt} title="방문일 선택" testID="hospital-visited-at-picker" />
      </Field>
      <Field label="진단/처방 (선택)">
        <InputBox value={diagnosis} placeholder="진단명이나 처방 내용을 입력하세요" onChangeText={setDiagnosis} />
      </Field>
      <Field label="메모 (선택)">
        <InputBox value={note} placeholder="메모를 입력하세요" multiline onChangeText={setNote} />
      </Field>
      <RecordShareFields {...recordShare} />
      <PrimaryButton label={action.busy ? "저장 중..." : "기록 저장"} onPress={save} disabled={!canSave} testID="hospital-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function TimelineDetailRoute() {
  const back = useFallbackBack("/timeline");
  return (
    <SpecShell testID="screen-timeline-detail">
      <Header title="기록 상세" onBack={back} />
      <View style={styles.statsEmptyCard}>
        <Text style={styles.statsEmptyTitle}>선택된 기록이 없어요</Text>
        <Text style={styles.statsEmptyDescription}>타임라인에서 기록을 선택하면 상세 내용을 확인할 수 있어요.</Text>
      </View>
    </SpecShell>
  );
}

function DetailLine({ label, value, muted: isMuted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.detailValue, isMuted && styles.mutedText]}>{value}</Text>
    </View>
  );
}

export function FeedingStatsRoute() {
  return <CategoryStatsRoute kind="feeding" />;
}

export function SleepStatsRoute() {
  return <CategoryStatsRoute kind="sleep" />;
}

export function DiaperStatsRoute() {
  return <CategoryStatsRoute kind="diaper" />;
}

export function TemperatureStatsRoute() {
  return <CategoryStatsRoute kind="temperature" />;
}

export function MedicineStatsRoute() {
  return <CategoryStatsRoute kind="medicine" />;
}

export function PumpingStatsRoute() {
  return <CategoryStatsRoute kind="pumping" />;
}

export function GrowthStatsRoute() {
  return <CategoryStatsRoute kind="growth" />;
}

export function VaccinationStatsRoute() {
  return <CategoryStatsRoute kind="vaccination" />;
}

export function HospitalStatsRoute() {
  return <CategoryStatsRoute kind="hospital" />;
}

function CategoryStatsRoute({ kind }: { kind: DetailStatsKind }) {
  const app = useBabyBossAppContext();
  const back = useFallbackBack("/statistics");
  const [period, setPeriod] = useState<DetailStatsPeriod>("weekly");
  const [selectedDate, setSelectedDate] = useState(defaultStatsDate);
  const [selectedRange, setSelectedRange] = useState<DateRange>(() => ({
    startDate: startOfWeek(defaultStatsDate),
    endDate: endOfWeek(defaultStatsDate),
  }));
  const [displayMonth, setDisplayMonth] = useState(defaultStatsDate);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const dashboardRecentLogs = app.dashboard?.recentLogs ?? [];
  const [statsSourceData, setStatsSourceData] = useState<DetailStatsSourceData>(() => ({
    ...emptyDetailStatsSource,
    logs: dashboardRecentLogs,
  }));
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const config = detailStatsConfigs[kind];
  const familyId = app.session?.family.id ?? app.currentFamily?.id ?? null;
  const refreshKey = app.dashboard?.generatedAt ?? null;
  const scopedSourceData = filterDetailStatsSource(statsSourceData, period, selectedDate, selectedRange);
  const detailStats = buildDetailStatsViewModel(kind, config, scopedSourceData, period);
  const metric = isLoadingStats && detailStats.records.length === 0
    ? { value: config.emptyValue, meta: "불러오는 중..." }
    : detailStats.metric;
  const rangeLabel = period === "weekly"
    ? formatDateRangeLabel(selectedRange.startDate, selectedRange.endDate)
    : formatStatsRangeLabel(period, selectedDate);

  useEffect(() => {
    if (dashboardRecentLogs.length === 0) {
      return;
    }

    setStatsSourceData((current) => {
      const logsById = new Map(current.logs.map((log) => [log.id, log]));
      dashboardRecentLogs.forEach((log) => logsById.set(log.id, log));

      return {
        ...current,
        logs: [...logsById.values()],
      };
    });
  }, [refreshKey]);

  useEffect(() => {
    let isActive = true;

    if (!familyId) {
      setStatsSourceData(emptyDetailStatsSource);
      setLoadMessage(null);
      setIsLoadingStats(false);
      return () => {
        isActive = false;
      };
    }

    const activeFamilyId = familyId;

    async function loadDetailStats() {
      setIsLoadingStats(true);

      try {
        const [logs, growthMeasurements, vaccinations, hospitalVisits] = await Promise.all([
          fetchLogs(activeFamilyId, { limit: 200 }),
          fetchGrowthMeasurements(activeFamilyId),
          fetchVaccinations(activeFamilyId),
          fetchHospitalVisits(activeFamilyId),
        ]);

        if (isActive) {
          setStatsSourceData({ logs, growthMeasurements, vaccinations, hospitalVisits });
          setLoadMessage(null);
        }
      } catch (error) {
        if (isActive) {
          setStatsSourceData((current) =>
            current.logs.length > 0 ||
            current.growthMeasurements.length > 0 ||
            current.vaccinations.length > 0 ||
            current.hospitalVisits.length > 0
              ? current
              : emptyDetailStatsSource,
          );
          setLoadMessage(error instanceof Error ? error.message : "통계 데이터를 불러오지 못했어요.");
        }
      } finally {
        if (isActive) {
          setIsLoadingStats(false);
        }
      }
    }

    void loadDetailStats();

    return () => {
      isActive = false;
    };
  }, [familyId, refreshKey]);

  const moveRange = (direction: -1 | 1) => {
    if (period === "weekly") {
      const nextRange = {
        startDate: shiftDateByPeriod(selectedRange.startDate, period, direction),
        endDate: shiftDateByPeriod(selectedRange.endDate, period, direction),
      };
      setSelectedRange(nextRange);
      setSelectedDate(nextRange.endDate);
      setDisplayMonth(nextRange.endDate);
      setDatePickerOpen(false);
      return;
    }

    const nextDate = shiftDateByPeriod(selectedDate, period, direction);
    setSelectedDate(nextDate);
    setDisplayMonth(nextDate);
    setDatePickerOpen(false);
  };

  return (
    <SpecShell
      testID={config.testID}
      overlay={
        <CalendarDatePickerOverlay
          visible={datePickerOpen}
          selectedDate={selectedDate}
          displayMonth={displayMonth}
          mode={period === "monthly" ? "month" : "date"}
          selectionMode={period === "weekly" ? "week" : "single"}
          selectedRange={selectedRange}
          title={period === "monthly" ? "월 선택" : period === "weekly" ? "주간 선택" : "날짜 선택"}
          testID={`${config.testID}-date-picker`}
          onClose={() => setDatePickerOpen(false)}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setDisplayMonth(date);
            setDatePickerOpen(false);
          }}
          onSelectRange={(range) => {
            setSelectedRange(range);
            setSelectedDate(range.endDate);
            setDisplayMonth(range.endDate);
            setDatePickerOpen(false);
          }}
          onDisplayMonthChange={setDisplayMonth}
        />
      }
    >
      <Header title={config.title} onBack={back} />
      <Segmented
        options={detailStatPeriods.map((item) => ({
          label: item.label,
          active: period === item.key,
          onPress: () => {
            setPeriod(item.key);
            setDatePickerOpen(false);
          },
        }))}
      />
      <View style={styles.detailDateControl}>
        <Pressable
          style={styles.dateStepButton}
          onPress={() => {
            moveRange(-1);
          }}
        >
          <RecordIcon name="back-arrow" size={18} color="#334155" />
        </Pressable>
        <Pressable
          style={[styles.detailRangePickerButton, datePickerOpen && styles.detailRangePickerButtonActive]}
          onPress={() => setDatePickerOpen((current) => !current)}
          accessibilityRole="button"
          testID={`${config.testID}-date-picker-open`}
        >
          <Text style={styles.rangeText}>{rangeLabel}</Text>
          <RecordIcon name="calendar" size={15} color={primary} strokeWidth={2.1} />
        </Pressable>
        <Pressable
          style={styles.dateStepButton}
          onPress={() => {
            moveRange(1);
          }}
        >
          <RecordIcon name="next-arrow" size={18} color="#334155" />
        </Pressable>
      </View>
      <MetricHeader title={config.metricTitle} value={metric.value} meta={metric.meta} />
      <ActionStatus message={loadMessage} />
      <DetailStatsChart type={config.chart} chartData={detailStats.chartData} donutData={detailStats.donutData} />
      <Text style={styles.sectionLabel}>기록 목록</Text>
      {detailStats.records.length > 0 ? (
        detailStats.records.map((record) => (
          <DetailLine key={record.id} label={record.label} value={record.value} />
        ))
      ) : (
        <View style={styles.statsEmptyCard}>
          <Text style={styles.statsEmptyTitle}>아직 기록이 없어요</Text>
          <Text style={styles.statsEmptyDescription}>기록을 추가하면 이곳에 목록이 표시됩니다.</Text>
        </View>
      )}
    </SpecShell>
  );
}

function DetailStatsChart({
  type,
  chartData,
  donutData,
}: {
  type: DetailStatsConfig["chart"];
  chartData: DetailStatsPoint[];
  donutData: DetailStatsDonutSegment[];
}) {
  const hasData = type === "donut" ? donutData.length > 0 : chartData.length > 0;

  if (!hasData) {
    return (
      <View style={styles.statsEmptyChart}>
        <Text style={styles.statsEmptyTitle}>아직 통계가 없어요</Text>
        <Text style={styles.statsEmptyDescription}>기록을 추가하면 차트가 표시됩니다.</Text>
      </View>
    );
  }

  if (type === "line") {
    return (
      <View testID="detail-stats-chart-data">
        <LineChartLite data={chartData} />
      </View>
    );
  }

  if (type === "donut") {
    return (
      <View testID="detail-stats-chart-data">
        <DonutChartLite segments={donutData} />
      </View>
    );
  }

  return (
    <View testID="detail-stats-chart-data">
      <StatBars data={chartData} />
    </View>
  );
}

function MetricHeader({ title, value, meta }: { title: string; value: string; meta: string }) {
  return (
    <View style={styles.metricHeader}>
      <Text style={styles.metricTitle}>{title}</Text>
      <View style={styles.metricRow}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricMeta}>{meta}</Text>
      </View>
    </View>
  );
}

export function GrowthAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("성장 기록을 저장했어요.", "/growth");
  const [measuredAt, setMeasuredAt] = useState(() => toDateTimeInputValue());
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [head, setHead] = useState("");
  const [note, setNote] = useState("");
  const recordShare = useRecordShareForm();
  const canSave = Boolean(parseMeasurement(height) || parseMeasurement(weight) || parseMeasurement(head)) && recordShare.ready && !action.busy;
  const save = () =>
    action.run((session) =>
      createGrowthMeasurement(session.family.id, {
        childId: requireSessionChild(session).id,
        measuredAt: toRecordedAt(measuredAt),
        heightCm: parseMeasurement(height),
        weightKg: parseMeasurement(weight),
        headCircumferenceCm: parseMeasurement(head),
        note,
        ...toRecordSharePayload(recordShare.state),
      }),
    );

  return (
    <SpecShell testID="screen-growth-add">
      <Header title="성장 기록" onBack={back} />
      <Field label="측정일">
        <DateTimePickerField value={measuredAt} onChange={setMeasuredAt} title="성장 측정일 선택" testID="growth-measured-at-picker" />
      </Field>
      <Field label="키">
        <InputBox value={height} placeholder="예: 72.0 cm" onChangeText={setHeight} keyboardType="decimal-pad" />
      </Field>
      <Field label="몸무게">
        <InputBox value={weight} placeholder="예: 9.2 kg" onChangeText={setWeight} keyboardType="decimal-pad" />
      </Field>
      <Field label="머리둘레">
        <InputBox value={head} placeholder="예: 44.0 cm" onChangeText={setHead} keyboardType="decimal-pad" />
      </Field>
      <Field label="메모 (선택)">
        <InputBox value={note} placeholder="메모를 입력하세요" onChangeText={setNote} />
      </Field>
      <RecordShareFields {...recordShare} />
      <PrimaryButton label={action.busy ? "저장 중..." : "기록 저장"} onPress={save} disabled={!canSave} testID="growth-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function GrowthDetailRoute() {
  const router = useRouter();
  const back = useFallbackBack("/growth");
  const [measurements, setMeasurements] = useState<GrowthMeasurementCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const latest = measurements[0] ?? null;

  useEffect(() => {
    let isActive = true;

    async function loadMeasurements() {
      setIsLoading(true);
      try {
        const session = await restoreSession();
        const rows = await fetchGrowthMeasurements(session.family.id);

        if (isActive) {
          setMeasurements(rows);
          setMessage(null);
        }
      } catch (error) {
        if (isActive) {
          setMeasurements([]);
          setMessage(error instanceof Error ? error.message : "성장 기록을 불러오지 못했어요.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadMeasurements();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <SpecShell testID="screen-growth-detail">
      <Segmented options={[{ label: "키", active: true }, { label: "몸무게" }, { label: "머리둘레" }]} />
      <Segmented options={[{ label: "3개월", active: true }, { label: "6개월" }, { label: "1년" }, { label: "전체" }]} />
      <MetricHeader
        title="최근 성장 기록"
        value={formatGrowthDetailMetric(latest)}
        meta={isLoading ? "불러오는 중..." : latest ? `최근 ${formatGrowthDetailDate(latest.measuredAt)}` : "기록 없음"}
      />
      {message ? <ActionStatus message={message} /> : null}
      {measurements.length > 0 ? (
        <GrowthMeasurementChart measurements={measurements} />
      ) : (
        <View style={styles.statsEmptyChart}>
          <Text style={styles.statsEmptyTitle}>아직 통계가 없어요</Text>
          <Text style={styles.statsEmptyDescription}>성장 기록을 추가하면 차트가 표시됩니다.</Text>
        </View>
      )}
      <Text style={styles.sectionLabel}>기록 목록</Text>
      {measurements.length > 0 ? (
        measurements.slice(0, 10).map((measurement) => (
          <DetailLine
            key={measurement.id}
            label={formatGrowthDetailDate(measurement.measuredAt)}
            value={formatGrowthDetailRecord(measurement)}
          />
        ))
      ) : (
        <View style={styles.statsEmptyCard}>
          <Text style={styles.statsEmptyTitle}>아직 기록이 없어요</Text>
          <Text style={styles.statsEmptyDescription}>기록을 추가하면 이곳에 목록이 표시됩니다.</Text>
        </View>
      )}
      <PrimaryButton label="+ 기록 추가" onPress={() => router.push("/growth-add")} />
      <OutlineButton label="뒤로" onPress={back} />
    </SpecShell>
  );
}

function GrowthMeasurementChart({ measurements }: { measurements: GrowthMeasurementCard[] }) {
  const points = measurements
    .filter((measurement) => measurement.weightKg != null)
    .slice(0, 6)
    .reverse();

  if (points.length === 0) {
    return (
      <View style={styles.statsEmptyChart}>
        <Text style={styles.statsEmptyTitle}>몸무게 기록이 없어요</Text>
        <Text style={styles.statsEmptyDescription}>몸무게를 입력하면 추이 차트가 표시됩니다.</Text>
      </View>
    );
  }

  const values = points.map((measurement) => measurement.weightKg ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const step = points.length > 1 ? 210 / (points.length - 1) : 0;
  const coordinates = points.map((measurement, index) => {
    const value = measurement.weightKg ?? 0;
    const x = points.length > 1 ? 44 + index * step : 150;
    const y = 178 - ((value - min) / range) * 118;
    return { x, y, measurement };
  });
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <View style={styles.growthChartBox}>
      <Svg width="100%" height="100%" viewBox="0 0 300 220">
        {[44, 80, 116, 152, 188].map((y) => (
          <Line key={y} x1="28" y1={y} x2="260" y2={y} stroke="#EAF2EF" strokeWidth="1" />
        ))}
        {coordinates.map((point) => (
          <Line key={`grid-${point.x}`} x1={point.x} y1="42" x2={point.x} y2="188" stroke="#F2F5FA" strokeWidth="1" />
        ))}
        {coordinates.length > 1 ? <Polyline points={polyline} fill="none" stroke={primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {coordinates.map((point) => (
          <Circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="4" fill={primary} stroke="#FFFFFF" strokeWidth="2" />
        ))}
        {coordinates.map((point) => (
          <SvgText key={`label-${point.x}`} x={point.x} y="210" fill="#AEB7C5" fontSize="9" fontWeight="700" fontFamily={FONT_FAMILY} textAnchor="middle">
            {formatGrowthDetailChartLabel(point.measurement.measuredAt)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function formatGrowthDetailMetric(measurement: GrowthMeasurementCard | null) {
  if (!measurement) {
    return "-";
  }

  if (measurement.heightCm != null) {
    return `${formatMeasurementNumber(measurement.heightCm)} cm`;
  }

  if (measurement.weightKg != null) {
    return `${formatMeasurementNumber(measurement.weightKg)} kg`;
  }

  if (measurement.headCircumferenceCm != null) {
    return `${formatMeasurementNumber(measurement.headCircumferenceCm)} cm`;
  }

  return "기록 있음";
}

function formatGrowthDetailRecord(measurement: GrowthMeasurementCard) {
  const parts = [
    measurement.heightCm == null ? null : `키 ${formatMeasurementNumber(measurement.heightCm)} cm`,
    measurement.weightKg == null ? null : `몸무게 ${formatMeasurementNumber(measurement.weightKg)} kg`,
    measurement.headCircumferenceCm == null ? null : `머리둘레 ${formatMeasurementNumber(measurement.headCircumferenceCm)} cm`,
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : "측정값 없음";
}

function formatMeasurementNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatGrowthDetailDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function formatGrowthDetailChartLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

export function NotificationSettingsRoute() {
  const back = useFallbackBack("/settings");
  const app = useBabyBossAppContext();
  const action = useSpecAction("기록 리마인더를 저장했어요.");
  const [recordAlarms, setRecordAlarms] = useState<RecordAlarmFormMap>(() => createRecordAlarmMap());
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferencesSummary | null>(null);
  const [loadMessage, setLoadMessage] = useState<string | null>("기록 리마인더를 준비하는 중이에요.");

  useEffect(() => {
    if (!app.settings) {
      setLoadMessage("기록 리마인더를 준비하는 중이에요.");
      return;
    }

    setRecordAlarms(createRecordReminderSettingsMap(app.settings.recordAlarmRules, app.settings.notificationPreferences));
    setNotificationPreferences(app.settings.notificationPreferences);
    setLoadMessage(null);
  }, [app.settings]);

  function updateRecordAlarm(logType: LogType, updater: React.SetStateAction<RecordAlarmFormState>) {
    setRecordAlarms((current) => {
      const previous = recordAlarmStateFor(current, logType);
      return {
        ...current,
        [logType]: typeof updater === "function" ? updater(previous) : updater,
      };
    });
  }

  const save = () => {
    if (!notificationPreferences) {
      setLoadMessage("기록 리마인더를 불러온 뒤 저장할 수 있어요.");
      return;
    }

    void action.run(async (session) => {
      const feedingAlarm = recordAlarmStateFor(recordAlarms, "FEEDING");
      const medicineAlarm = recordAlarmStateFor(recordAlarms, "MEDICINE");
      const updatedPreferences = await updateNotificationPreferences(session.family.id, {
        ...notificationPreferences,
        feedingEnabled: feedingAlarm.enabled,
        medicineEnabled: medicineAlarm.enabled,
      });

      const updatedRules = await Promise.all(
        alarmLogTypes.map((logType) => {
          const alarm = recordAlarmStateFor(recordAlarms, logType);
          const payload = toRecordAlarmPayload(alarm);
          return upsertRecordAlarmRule(session.family.id, {
            logType,
            enabled: alarm.enabled,
            intervalMinutes: payload.nextAlarmMinutes ?? defaultRecordAlarmMinutes[logType],
            notifyScope: alarm.notifyScope,
          });
        }),
      );

      setNotificationPreferences(updatedPreferences);
      if (app.settings) {
        app.applySettings({
          ...app.settings,
          notificationPreferences: updatedPreferences,
          recordAlarmRules: updatedRules,
        });
      }
    });
  };

  return (
    <SpecShell testID="screen-notification-settings">
      <Header title="기록 리마인더" action="저장" actionTestID="record-reminders-save" onBack={back} onAction={save} />
      <View style={styles.notificationSettingsIntro} testID="record-reminders-intro">
        <View style={styles.notificationSettingsIntroIcon}>
          <RecordIcon name="notification-bell" size={24} color={primary} strokeWidth={2.2} />
        </View>
        <View style={styles.notificationSettingsIntroCopy}>
          <Text style={styles.notificationSettingsIntroTitle}>다음 기록 알림</Text>
          <Text style={styles.notificationSettingsIntroBody}>카테고리별로 다음 기록 시점을 설정해요.</Text>
        </View>
      </View>
      <Text style={styles.sectionLabel}>카테고리별 리마인더</Text>
      {alarmLogTypes.map((logType) => (
        <RecordAlarmSettingsCard
          key={logType}
          logType={logType}
          alarm={recordAlarmStateFor(recordAlarms, logType)}
          setAlarm={(updater) => updateRecordAlarm(logType, updater)}
        />
      ))}
      <ActionStatus message={loadMessage} />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function DataBackupRoute() {
  const back = useFallbackBack("/settings");
  const action = useSpecAction("백업 요청을 만들었어요.");
  const save = () =>
    action.run((session) =>
      requestDataExport(session.family.id, {
        format: "PDF",
        sections: ["logs", "growth", "vaccinations", "hospital", "memories"],
      }),
    );

  return (
    <SpecShell testID="screen-data-backup">
      <Header title="백업" onBack={back} />
      <View style={styles.centerHero}>
        <RecordIcon name="backup-export" size={54} />
        <Text style={styles.heroTitle}>데이터를 안전하게 백업해요.</Text>
      </View>
      <Field label="백업 위치">
        <ListRow title="Google Drive" subtitle="연결된 계정 없음" />
      </Field>
      <DetailLine label="최근 백업" value="2024-05-20 14:30" />
      <PrimaryButton label="백업하기" onPress={save} disabled={action.busy} />
      <ActionStatus message={action.message} />
      <Text style={styles.footerNote}>Wi-Fi 환경에서 백업하는 것을 권장해요.</Text>
    </SpecShell>
  );
}

export function DataExportRoute() {
  const back = useFallbackBack("/settings");
  const action = useSpecAction("내보내기 요청을 만들었어요.");
  const save = () =>
    action.run((session) =>
      requestDataExport(session.family.id, {
        format: "PDF",
        sections: ["feeding", "sleep", "diaper", "temperature", "medicine", "pumping", "memo", "growth"],
      }),
    );

  return (
    <SpecShell testID="screen-data-export">
      <Header title="데이터 내보내기" onBack={back} />
      <Text style={styles.sectionLabel}>내보낼 데이터</Text>
      {["수유", "수면", "배변", "체온", "약/영양제", "유축", "메모", "성장 기록"].map((item) => (
        <View key={item} style={styles.checkRow}>
          <RecordIcon name="confirm-check" size={16} />
          <Text style={styles.rowTitle}>{item}</Text>
          <Text style={styles.checkMark}>✓</Text>
        </View>
      ))}
      <Text style={styles.sectionLabel}>파일 형식</Text>
      <Segmented options={[{ label: "PDF", active: true }, { label: "Excel" }, { label: "CSV" }]} />
      <PrimaryButton label="내보내기" onPress={save} disabled={action.busy} />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function PrivacyRoute() {
  const back = useFallbackBack("/settings");
  const router = useRouter();

  return (
    <SpecShell testID="screen-privacy">
      <Header title="개인정보 설정" onBack={back} />
      <ListRow
        title="개인정보 수정"
        subtitle="닉네임, 역할, 연락처, 비밀번호를 수정합니다."
        icon="data-security"
        onPress={() => router.push("/personal-info")}
      />
      <ListRow title="개인정보 처리방침" subtitle="수집 항목, 이용 목적, 보관 기간을 확인합니다." icon="data-security" onPress={() => router.push("/privacy-policy")} />
      <ListRow title="이용약관" subtitle="서비스 이용 기준과 책임 범위를 확인합니다." icon="memo" onPress={() => router.push("/terms")} />
      <ListRow title="계정 탈퇴" />
      <OutlineButton label="로그아웃" danger />
    </SpecShell>
  );
}

export function PersonalInfoRoute() {
  const back = useFallbackBack("/settings");
  const app = useBabyBossAppContext();
  const action = useSaveAndNavigateAction("개인정보를 저장했어요.", "/settings");
  const caregiver = app.session?.caregiver ?? null;
  const [name, setName] = useState(caregiver?.name ?? roleDefaultNickname.GUARDIAN);
  const [role, setRole] = useState<CaregiverRole>(caregiver?.role ?? "GUARDIAN");
  const [contactPhone, setContactPhone] = useState(caregiver?.contactPhone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(caregiver?.name ?? roleDefaultNickname.GUARDIAN);
    setRole(caregiver?.role ?? "GUARDIAN");
    setContactPhone(caregiver?.contactPhone ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setPasswordConfirmation("");
    setValidationMessage(null);
  }, [caregiver?.id, caregiver?.name, caregiver?.role, caregiver?.contactPhone]);

  const passwordChangeRequested = Boolean(currentPassword || newPassword || passwordConfirmation);

  function save() {
    if (!caregiver) {
      setValidationMessage("프로필 정보를 불러오지 못했어요.");
      return;
    }

    if (!name.trim()) {
      setValidationMessage("닉네임을 입력해 주세요.");
      return;
    }

    if (passwordChangeRequested) {
      if (!currentPassword || !newPassword || !passwordConfirmation) {
        setValidationMessage("비밀번호를 바꾸려면 모든 비밀번호 항목을 입력해 주세요.");
        return;
      }

      if (newPassword !== passwordConfirmation) {
        setValidationMessage("새 비밀번호가 일치하지 않습니다.");
        return;
      }

      if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
        setValidationMessage("새 비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.");
        return;
      }
    }

    setValidationMessage(null);
    void action.run((session) =>
      updateCaregiverPersonalInfo(session.caregiver.id, {
        name,
        role,
        contactPhone,
        currentPassword: passwordChangeRequested ? currentPassword : undefined,
        newPassword: passwordChangeRequested ? newPassword : undefined,
      }),
    );
  }

  return (
    <SpecShell testID="screen-personal-info">
      <Header title="개인정보 수정" onBack={back} />
      <Field label="이메일">
        <View style={styles.readOnlyValue}>
          <Text style={styles.readOnlyValueText}>{caregiver?.email ?? "이메일 정보 없음"}</Text>
        </View>
      </Field>
      <Field label="닉네임">
        <InputBox value={name} placeholder="닉네임을 입력하세요" onChangeText={setName} testID="personal-info-name-input" />
      </Field>
      <Field label="역할">
        <Segmented
          options={caregiverRoleOptions.map((item) => ({
            label: roleLabel[item],
            active: role === item,
            onPress: () => {
              setName((currentName) => nicknameForRoleChange(currentName, role, item));
              setRole(item);
            },
            testID: `personal-info-role-${item}`,
          }))}
        />
      </Field>
      <Field label="연락처">
        <InputBox
          value={contactPhone}
          placeholder="010-1234-5678"
          keyboardType="phone-pad"
          onChangeText={setContactPhone}
          testID="personal-info-contact-phone-input"
        />
      </Field>
      <View style={styles.personalInfoPasswordSection}>
        <Text style={styles.sectionLabel}>비밀번호 변경 (선택)</Text>
        <Text style={styles.personalInfoHint}>변경할 때만 현재 비밀번호와 새 비밀번호를 입력하세요.</Text>
      </View>
      <Field label="현재 비밀번호">
        <InputBox
          value={currentPassword}
          placeholder="현재 비밀번호"
          secureTextEntry
          autoCapitalize="none"
          onChangeText={setCurrentPassword}
          testID="personal-info-current-password-input"
        />
      </Field>
      <Field label="새 비밀번호">
        <InputBox
          value={newPassword}
          placeholder="영문과 숫자를 포함해 8자 이상"
          secureTextEntry
          autoCapitalize="none"
          onChangeText={setNewPassword}
          testID="personal-info-new-password-input"
        />
      </Field>
      <Field label="새 비밀번호 확인">
        <InputBox
          value={passwordConfirmation}
          placeholder="새 비밀번호를 다시 입력하세요"
          secureTextEntry
          autoCapitalize="none"
          onChangeText={setPasswordConfirmation}
          testID="personal-info-password-confirmation-input"
        />
      </Field>
      {validationMessage ? <ActionStatus message={validationMessage} /> : null}
      <PrimaryButton label={action.busy ? "저장 중..." : "저장"} onPress={save} disabled={action.busy || !caregiver} testID="personal-info-save" />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

const appInfoRows = [
  { label: "앱 이름", value: "아이로그" },
  { label: "버전", value: "1.0.0" },
  { label: "앱 ID", value: "com.ilog.mobile" },
];

type LegalSection = {
  title: string;
  body: string[];
};

const termsSections: LegalSection[] = [
  {
    title: "서비스 목적",
    body: [
      "아이로그는 가족 구성원이 아이의 수유, 수면, 배변, 체온, 병원 방문, 예방접종, 메모 등을 함께 기록하고 확인할 수 있도록 돕는 육아 기록 서비스입니다.",
      "앱의 기록과 통계는 보호자의 생활 기록을 돕기 위한 정보이며, 의료 진단이나 치료 판단을 대체하지 않습니다.",
    ],
  },
  {
    title: "계정과 가족 공간",
    body: [
      "회원은 이메일, Google 로그인 또는 가족 초대 코드를 통해 서비스에 가입할 수 있습니다.",
      "가족 공간에 참여한 보호자는 같은 가족에 등록된 아이 정보와 육아 기록을 열람하거나 작성할 수 있습니다.",
    ],
  },
  {
    title: "기록 데이터",
    body: [
      "회원은 자신이 입력하는 기록이 정확하도록 관리해야 하며, 잘못 입력된 기록은 가족 구성원의 판단에 영향을 줄 수 있습니다.",
      "사진, 메모, 댓글 등 가족 공간에 공유되는 내용은 다른 가족 구성원이 볼 수 있습니다.",
    ],
  },
  {
    title: "알림과 외부 서비스",
    body: [
      "푸시 알림은 기기 설정, 네트워크 상태, Expo Push 서비스 상태에 따라 지연되거나 전달되지 않을 수 있습니다.",
      "Google 로그인은 Google과 Supabase Auth의 인증 흐름을 사용합니다.",
    ],
  },
  {
    title: "금지 행위",
    body: [
      "타인의 계정 또는 가족 초대 코드를 무단으로 사용하면 안 됩니다.",
      "불법 정보, 타인의 개인정보, 악성 코드, 서비스 운영을 방해하는 내용을 등록하면 안 됩니다.",
    ],
  },
  {
    title: "약관 변경",
    body: [
      "운영자는 서비스 기능, 법령, 운영 정책 변경에 따라 약관을 수정할 수 있습니다.",
      "정식 운영 전 문구는 법무 및 개인정보보호 검토 후 확정해야 합니다.",
    ],
  },
];

const privacyPolicySections: LegalSection[] = [
  {
    title: "처리 목적",
    body: [
      "회원 가입, 로그인, 가족 공간 생성 및 초대, 아이 정보 관리, 육아 기록 저장, 통계 제공, 댓글 및 알림 제공을 위해 개인정보를 처리합니다.",
      "문의 대응, 서비스 안정성 확인, 부정 이용 방지 등 서비스 운영에 필요한 범위에서도 정보를 사용할 수 있습니다.",
    ],
  },
  {
    title: "처리하는 정보",
    body: [
      "보호자 정보: 이메일, 이름, 역할, 프로필 이미지, 로그인 식별자, 가족 초대 정보",
      "아이 정보: 이름, 생년월일, 성별, 프로필 이미지",
      "기록 정보: 수유, 수면, 배변, 체온, 약/영양제, 유축, 성장, 예방접종, 병원 방문, 메모, 댓글, 사진 첨부 정보",
      "기기 및 알림 정보: Expo Push Token, 알림 설정, 접속 환경에서 생성되는 기본 로그",
    ],
  },
  {
    title: "보관 기간",
    body: [
      "회원과 가족 공간이 유지되는 동안 서비스 제공을 위해 정보를 보관합니다.",
      "회원이 탈퇴하거나 삭제를 요청한 정보는 관련 법령상 보관이 필요한 경우를 제외하고 지체 없이 삭제하는 정책으로 운영해야 합니다.",
    ],
  },
  {
    title: "제3자 제공 및 외부 서비스",
    body: [
      "현재 서비스는 인증과 데이터 저장에 Supabase, Google 로그인에 Google OAuth, 푸시 알림에 Expo Push 서비스를 사용합니다.",
      "정식 운영 전 각 외부 서비스의 처리 위치, 보관 방식, 국외 이전 여부, 위탁 관계를 운영 정책에 맞게 확정해야 합니다.",
    ],
  },
  {
    title: "권리 행사",
    body: [
      "회원은 본인 정보의 열람, 수정, 삭제, 처리 정지를 요청할 수 있어야 합니다.",
      "아이 정보와 가족 기록은 가족 구성원 권한과 안전한 기록 보존 필요성을 함께 고려해 처리해야 합니다.",
    ],
  },
  {
    title: "안전성 확보",
    body: [
      "서비스는 Supabase Auth 세션, 데이터베이스 접근 정책, 저장소 접근 제어를 통해 가족 단위 접근을 제한합니다.",
      "비밀키와 서비스 역할 키는 모바일 앱에 포함하지 않고 서버 또는 운영 환경에서만 관리해야 합니다.",
    ],
  },
  {
    title: "처리방침 변경",
    body: [
      "이 개인정보 처리방침 초안의 기준일은 2026년 7월 8일입니다.",
      "정식 운영 전 개인정보보호위원회 작성지침과 실제 운영 정책을 기준으로 최종 검토해야 합니다.",
    ],
  },
];

const licenseSections: LegalSection[] = [
  {
    title: "주요 오픈소스",
    body: [
      "Expo, React Native, React, Expo Router, Supabase JS, Lucide React Native, React Native SVG, React Native Gifted Charts를 사용합니다.",
      "각 라이브러리의 라이선스 전문은 배포 전 패키지 라이선스 목록으로 별도 고지해야 합니다.",
    ],
  },
  {
    title: "라이선스 고지",
    body: [
      "현재 화면은 앱 내 고지 위치를 마련하기 위한 기본 화면입니다.",
      "정식 배포 전 `package-lock.json` 기준으로 실제 포함 라이브러리와 라이선스를 자동 수집해 최신 목록으로 교체하는 것을 권장합니다.",
    ],
  },
];

export function AppInfoRoute() {
  const back = useFallbackBack("/settings");
  const router = useRouter();

  return (
    <SpecShell testID="screen-app-info">
      <Header title="앱 정보" onBack={back} />
      <View style={styles.appInfoHero}>
        <RecordIcon name="app-info" size={34} color={primary} strokeWidth={1.8} />
        <View style={styles.appInfoHeroCopy}>
          <Text style={styles.appInfoTitle}>아이로그</Text>
          <Text style={styles.appInfoDescription}>가족이 함께 쓰는 육아 기록 앱</Text>
        </View>
      </View>
      {appInfoRows.map((row) => (
        <DetailLine key={row.label} label={row.label} value={row.value} />
      ))}
      <Text style={styles.sectionLabel}>정책 및 고지</Text>
      <ListRow title="이용약관" subtitle="서비스 이용 기준과 책임 범위" icon="memo" onPress={() => router.push("/terms")} />
      <ListRow title="개인정보 처리방침" subtitle="수집 항목, 보관 기간, 권리 행사 안내" icon="data-security" onPress={() => router.push("/privacy-policy")} />
      <ListRow title="오픈소스 라이선스" subtitle="앱에서 사용하는 주요 라이브러리 고지" icon="app-info" onPress={() => router.push("/open-source-licenses")} />
      <Text style={styles.footerNote}>정식 운영 전 사업자 정보, 문의처, 약관, 개인정보 처리방침을 실제 운영 정책에 맞게 확정해야 해요.</Text>
    </SpecShell>
  );
}

export function TermsRoute() {
  return (
    <LegalDocumentRoute
      testID="screen-terms"
      title="이용약관"
      intro="아이로그 서비스 이용 기준을 정리한 초안입니다. 정식 운영 전 최종 검토가 필요합니다."
      sections={termsSections}
    />
  );
}

export function PrivacyPolicyRoute() {
  return (
    <LegalDocumentRoute
      testID="screen-privacy-policy"
      title="개인정보 처리방침"
      intro="개인정보 처리 목적, 항목, 보관 기간, 외부 서비스 사용을 정리한 초안입니다."
      sections={privacyPolicySections}
    />
  );
}

export function OpenSourceLicensesRoute() {
  return (
    <LegalDocumentRoute
      testID="screen-open-source-licenses"
      title="오픈소스 라이선스"
      intro="앱에서 사용하는 주요 오픈소스 라이브러리 고지 위치입니다."
      sections={licenseSections}
    />
  );
}

function LegalDocumentRoute({
  testID,
  title,
  intro,
  sections,
}: {
  testID: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  const back = useFallbackBack("/app-info");

  return (
    <SpecShell testID={testID}>
      <Header title={title} onBack={back} />
      <View style={styles.legalIntroCard}>
        <Text style={styles.legalIntroText}>{intro}</Text>
      </View>
      {sections.map((section) => (
        <View key={section.title} style={styles.legalSection}>
          <Text style={styles.legalSectionTitle}>{section.title}</Text>
          {section.body.map((paragraph) => (
            <Text key={paragraph} style={styles.legalParagraph}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </SpecShell>
  );
}

export function VaccinationsRoute() {
  const back = useFallbackBack("/settings");
  const router = useRouter();
  const [vaccinations, setVaccinations] = useState<VaccinationCard[]>([]);
  const [loadMessage, setLoadMessage] = useState<string | null>("예방접종 기록을 불러오는 중...");

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const session = await restoreSession();
        const rows = await fetchVaccinations(session.family.id);

        if (isActive) {
          setVaccinations(rows);
          setLoadMessage(rows.length > 0 ? null : "예방접종 기록이 아직 없어요.");
        }
      } catch (error) {
        if (isActive) {
          setLoadMessage(error instanceof Error ? error.message : "예방접종 기록을 불러오지 못했어요.");
        }
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <SpecShell testID="screen-vaccinations">
      <Header title="예방접종" action="추가" onBack={back} onAction={() => router.push("/vaccination-add")} />
      <Segmented options={[{ label: "예정", active: true }, { label: "완료" }]} />
      {vaccinations.map((vaccination) => (
        <VaccineRow
          key={vaccination.id}
          title={vaccination.name}
          due={`${vaccinationStatusText(vaccination.status)} ${formatDate(vaccination.completedAt ?? vaccination.dueAt)}`}
        />
      ))}
      <ActionStatus message={loadMessage} />
      <Text style={styles.footerNote}>예정일은 변경될 수 있어요.</Text>
    </SpecShell>
  );
}

function VaccineRow({ title, due }: { title: string; due: string }) {
  return <ListRow title={title} subtitle={due} icon="vaccine" />;
}

function vaccinationStatusText(status: VaccinationCard["status"]) {
  switch (status) {
    case "SCHEDULED":
      return "예정";
    case "COMPLETED":
      return "완료";
    case "SKIPPED":
      return "건너뜀";
  }
}

export function HospitalVisitsRoute() {
  const back = useFallbackBack("/settings");
  const router = useRouter();
  const [visits, setVisits] = useState<HospitalVisitCard[]>([]);
  const [loadMessage, setLoadMessage] = useState<string | null>("병원 방문 기록을 불러오는 중...");

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const session = await restoreSession();
        const rows = await fetchHospitalVisits(session.family.id);

        if (isActive) {
          setVisits(rows);
          setLoadMessage(rows.length > 0 ? null : "병원 방문 기록이 아직 없어요.");
        }
      } catch (error) {
        if (isActive) {
          setLoadMessage(error instanceof Error ? error.message : "병원 방문 기록을 불러오지 못했어요.");
        }
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <SpecShell testID="screen-hospital-visits">
      <Header title="병원 방문" action="추가" onBack={back} onAction={() => router.push("/hospital-add")} />
      {visits.map((visit) => (
        <ListRow
          key={visit.id}
          title={visit.hospitalName}
          subtitle={[formatDate(visit.visitedAt), visit.reason ?? visit.diagnosis].filter(Boolean).join(" · ")}
          icon="hospital"
        />
      ))}
      <ActionStatus message={loadMessage} />
    </SpecShell>
  );
}

export function FamilyChatRoute() {
  const router = useRouter();
  const app = useBabyBossAppContext();
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const caregivers = app.settings?.caregivers ?? app.bootstrap?.caregivers ?? [];

  useEffect(() => {
    if (app.familyChat || !app.session) {
      return;
    }

    void app.refreshFamilyChat().catch((error) => {
      setLoadError(error instanceof Error ? error.message : "가족 대화를 불러오지 못했어요.");
    });
  }, [app.familyChat, app.session]);

  async function sendMessage(payload: CreateFamilyChatMessageRequest) {
    if (!app.session) {
      throw new Error("로그인 정보를 찾지 못했어요.");
    }
    if (isSending) {
      throw new Error("메시지를 보내는 중이에요.");
    }

    setIsSending(true);
    setLoadError(null);
    try {
      const createdMessage = await createFamilyChatMessage(app.session.family.id, payload);
      app.applyFamilyChatMessage(createdMessage);
      void app.refreshFamilyChat().catch((error) => {
        setLoadError(error instanceof Error ? error.message : "가족 대화를 최신 상태로 불러오지 못했어요.");
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <FamilyChatView
      messages={app.familyChat?.messages ?? null}
      caregivers={caregivers}
      currentCaregiverId={app.session?.caregiver.id ?? null}
      sending={isSending}
      error={loadError}
      onBack={() => router.replace("/home")}
      onSend={sendMessage}
    />
  );
}

export function PhotoAlbumRoute() {
  const back = useFallbackBack("/settings");
  const app = useBabyBossAppContext();
  const [photos, setPhotos] = useState<FamilyPhotoCard[]>([]);
  const [loadMessage, setLoadMessage] = useState<string | null>("사진 기록을 불러오는 중...");
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentCaregiverId, setCurrentCaregiverId] = useState<number | null>(app.session?.caregiver.id ?? null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([]);
  const [isDeleteConfirmationVisible, setIsDeleteConfirmationVisible] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<FamilyPhotoCard | null>(null);

  useEffect(() => {
    if (app.session?.caregiver.id != null) {
      setCurrentCaregiverId(app.session.caregiver.id);
    }
  }, [app.session?.caregiver.id]);

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const session = app.session ?? (await restoreSession());
        const rows = await fetchPhotoAlbum(session.family.id);

        if (isActive) {
          setCurrentCaregiverId(session.caregiver.id);
          setPhotos(rows);
          setLoadMessage(rows.length > 0 ? null : "사진 기록이 아직 없어요.");
        }
      } catch (error) {
        if (isActive) {
          setLoadMessage(error instanceof Error ? error.message : "사진 기록을 불러오지 못했어요.");
        }
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, [app.session]);

  async function addPhoto() {
    if (isUploading || isDeleting) {
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setLoadMessage("사진 접근 권한을 허용해 주세요.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: MAX_FAMILY_ALBUM_UPLOADS,
        orderedSelection: true,
        quality: 0.85,
      });
      const assets = result.assets?.slice(0, MAX_FAMILY_ALBUM_UPLOADS) ?? [];

      if (result.canceled || assets.length === 0) {
        return;
      }

      setIsUploading(true);
      const session = app.session ?? (await restoreSession());
      const uploadedPhotos: FamilyPhotoCard[] = [];
      const failedUploads: string[] = [];

      for (const [index, asset] of assets.entries()) {
        setLoadMessage(`사진 ${index + 1}/${assets.length}장을 업로드하는 중이에요.`);

        try {
          const photo = await createFamilyPhoto(session.family.id, {
            image: await imagePickerAssetToUpload(asset),
          });
          uploadedPhotos.push(photo);
        } catch (error) {
          failedUploads.push(error instanceof Error ? error.message : "사진을 업로드하지 못했어요.");
        }
      }

      if (uploadedPhotos.length > 0) {
        setPhotos((current) => [...uploadedPhotos, ...current]);
      }

      if (failedUploads.length === 0) {
        setLoadMessage(uploadedPhotos.length === 1 ? "사진 앨범에 저장했어요." : `사진 ${uploadedPhotos.length}장을 앨범에 저장했어요.`);
      } else if (uploadedPhotos.length > 0) {
        setLoadMessage(`사진 ${uploadedPhotos.length}장을 저장했고, ${failedUploads.length}장은 업로드하지 못했어요.`);
      } else {
        setLoadMessage(failedUploads[0] ?? "사진을 업로드하지 못했어요.");
      }
    } catch (error) {
      setLoadMessage(error instanceof Error ? error.message : "사진을 업로드하지 못했어요.");
    } finally {
      setIsUploading(false);
    }
  }

  const activeCaregiverId = app.session?.caregiver.id ?? currentCaregiverId;
  const deletablePhotoCount = photos.filter((photo) => isDirectFamilyAlbumPhoto(photo, activeCaregiverId)).length;

  function exitSelectionMode() {
    setIsSelectionMode(false);
    setSelectedPhotoIds([]);
    setIsDeleteConfirmationVisible(false);
  }

  function toggleSelectionMode() {
    if (isSelectionMode) {
      exitSelectionMode();
      return;
    }

    if (deletablePhotoCount === 0) {
      setLoadMessage("삭제할 수 있는 내가 올린 사진이 없어요.");
      return;
    }

    setIsSelectionMode(true);
    setLoadMessage("내가 직접 올린 사진을 선택해 삭제할 수 있어요.");
  }

  function handlePhotoPress(photo: FamilyPhotoCard) {
    if (!isSelectionMode) {
      setPreviewPhoto(photo);
      return;
    }

    if (!isDirectFamilyAlbumPhoto(photo, activeCaregiverId)) {
      setLoadMessage("내가 직접 올린 앨범 사진만 삭제할 수 있어요.");
      return;
    }

    setSelectedPhotoIds((current) => togglePhotoSelection(current, photo.sourceId));
  }

  function handlePhotoLongPress(photo: FamilyPhotoCard) {
    if (isSelectionMode || !isDirectFamilyAlbumPhoto(photo, activeCaregiverId)) {
      return;
    }

    setIsSelectionMode(true);
    setSelectedPhotoIds([photo.sourceId]);
    setLoadMessage("사진을 선택했어요.");
  }

  function openDeleteConfirmation() {
    if (selectedPhotoIds.length === 0) {
      setLoadMessage("삭제할 사진을 먼저 선택해 주세요.");
      return;
    }

    setIsDeleteConfirmationVisible(true);
  }

  async function deleteSelectedPhotos() {
    const selectedPhotos = photos.filter(
      (photo) =>
        selectedPhotoIds.includes(photo.sourceId) && isDirectFamilyAlbumPhoto(photo, activeCaregiverId),
    );

    if (selectedPhotos.length === 0) {
      exitSelectionMode();
      setLoadMessage("삭제할 사진을 찾지 못했어요.");
      return;
    }

    setIsDeleting(true);
    setIsDeleteConfirmationVisible(false);

    try {
      const session = app.session ?? (await restoreSession());
      const deletedPhotoIds: number[] = [];
      const failedDeletes: string[] = [];

      for (const photo of selectedPhotos) {
        try {
          await deleteFamilyPhoto(session.family.id, photo.sourceId);
          deletedPhotoIds.push(photo.sourceId);
        } catch (error) {
          failedDeletes.push(error instanceof Error ? error.message : "사진을 삭제하지 못했어요.");
        }
      }

      if (deletedPhotoIds.length > 0) {
        setPhotos((current) => removeDeletedAlbumPhotos(current, deletedPhotoIds));
      }

      if (failedDeletes.length === 0) {
        setIsSelectionMode(false);
        setSelectedPhotoIds([]);
        setLoadMessage(`사진 ${deletedPhotoIds.length}장을 삭제했어요.`);
      } else {
        setSelectedPhotoIds((current) => current.filter((photoId) => !deletedPhotoIds.includes(photoId)));
        setLoadMessage(
          deletedPhotoIds.length > 0
            ? `사진 ${deletedPhotoIds.length}장을 삭제했고, ${failedDeletes.length}장은 삭제하지 못했어요.`
            : failedDeletes[0] ?? "사진을 삭제하지 못했어요.",
        );
      }
    } finally {
      setIsDeleting(false);
    }
  }

  const photosByMonth = photos.reduce<Record<string, FamilyPhotoCard[]>>((groups, photo) => {
    const key = formatMonth(photo.createdAt);
    return {
      ...groups,
      [key]: [...(groups[key] ?? []), photo],
    };
  }, {});

  return (
    <SpecShell testID="screen-photo-album">
      <Header
        title="사진 앨범"
        action={isUploading ? "업로드 중" : "추가"}
        actionTestID="photo-album-add"
        onBack={back}
        onAction={() => void addPhoto()}
      />
      <View style={styles.albumActionRow}>
        <Pressable
          style={[styles.albumActionButton, isSelectionMode && styles.albumActionButtonActive]}
          onPress={toggleSelectionMode}
          disabled={isUploading || isDeleting}
          accessibilityRole="button"
          testID="photo-album-select">
          <RecordIcon name={isSelectionMode ? "close" : "confirm-check"} size={16} color={primary} strokeWidth={2.4} />
          <Text style={styles.albumActionButtonText}>{isSelectionMode ? "선택 취소" : "사진 선택"}</Text>
        </Pressable>
        {isSelectionMode ? (
          <Pressable
            style={[styles.albumDeleteButton, (selectedPhotoIds.length === 0 || isDeleting) && styles.albumDeleteButtonDisabled]}
            onPress={openDeleteConfirmation}
            disabled={selectedPhotoIds.length === 0 || isDeleting}
            accessibilityRole="button"
            testID="photo-album-delete">
            <RecordIcon name="delete" size={16} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.albumDeleteButtonText}>{isDeleting ? "삭제 중" : `삭제 ${selectedPhotoIds.length > 0 ? selectedPhotoIds.length : ""}`}</Text>
          </Pressable>
        ) : null}
      </View>
      {Object.entries(photosByMonth).map(([month, monthPhotos]) => (
        <View key={month} style={styles.albumSection}>
          <Text style={styles.sectionLabel}>{month}</Text>
          <View style={styles.photoGrid}>
            {monthPhotos.map((photo) => {
              const isDeletable = isDirectFamilyAlbumPhoto(photo, activeCaregiverId);
              const isSelected = isDeletable && selectedPhotoIds.includes(photo.sourceId);

              return (
              <Pressable
                key={photo.id}
                style={[
                  styles.photoTile,
                  isSelectionMode && !isDeletable && styles.photoTileReadOnly,
                  isSelected && styles.photoTileSelected,
                ]}
                onPress={() => handlePhotoPress(photo)}
                onLongPress={() => handlePhotoLongPress(photo)}
                disabled={isDeleting}
                accessibilityRole="button"
                accessibilityLabel={isSelectionMode ? `${photo.createdByName}님 사진 선택` : `${photo.createdByName}님 사진 전체보기`}
                accessibilityState={{ selected: isSelected }}
                testID={`photo-album-item-${photo.id}`}>
                <Image
                  source={{ uri: photo.imageUrl }}
                  style={styles.albumPhotoImage}
                  resizeMode="cover"
                />
                {isSelectionMode && isDeletable ? (
                  <View style={[styles.albumSelectionBadge, isSelected && styles.albumSelectionBadgeSelected]}>
                    <RecordIcon name="confirm-check" size={14} color="#FFFFFF" strokeWidth={2.8} />
                  </View>
                ) : null}
              </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <ActionStatus message={loadMessage} />

      <FamilyImagePreviewModal
        visible={Boolean(previewPhoto)}
        imageUrl={previewPhoto?.imageUrl ?? null}
        title={previewPhoto ? `${previewPhoto.createdByName}님의 사진` : undefined}
        subtitle={previewPhoto?.caption}
        onClose={() => setPreviewPhoto(null)}
        testID="photo-album-preview"
      />

      <Modal
        visible={isDeleteConfirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDeleteConfirmationVisible(false)}>
        <View style={styles.albumDeleteModalOverlay} testID="photo-album-delete-dialog">
          <Pressable
            style={styles.albumDeleteModalBackdrop}
            onPress={() => setIsDeleteConfirmationVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="사진 삭제 취소"
          />
          <View style={styles.albumDeleteDialog}>
            <Text style={styles.albumDeleteDialogTitle}>선택한 사진을 삭제할까요?</Text>
            <Text style={styles.albumDeleteDialogBody}>삭제한 사진은 되돌릴 수 없어요.</Text>
            <View style={styles.albumDeleteDialogActions}>
              <Pressable
                style={styles.albumDialogCancelButton}
                onPress={() => setIsDeleteConfirmationVisible(false)}
                accessibilityRole="button"
                testID="photo-album-delete-cancel">
                <Text style={styles.albumDialogCancelText}>취소</Text>
              </Pressable>
              <Pressable
                style={styles.albumDialogDeleteButton}
                onPress={() => void deleteSelectedPhotos()}
                accessibilityRole="button"
                testID="photo-album-delete-confirm">
                <RecordIcon name="delete" size={16} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.albumDialogDeleteText}>삭제</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SpecShell>
  );
}

export function SearchRoute() {
  const back = useFallbackBack("/settings");
  const action = useSpecAction("검색을 완료했어요.");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultCard[]>([]);
  const search = () =>
    action.run(async (session) => {
      const rows = await searchFamilyRecords(session.family.id, query);
      setResults(rows);
    });

  return (
    <SpecShell testID="screen-search">
      <Header title="검색" onBack={back} />
      <InputBox
        value={query}
        placeholder="검색어를 입력하세요"
        right={<RecordIcon name="filter" size={18} color="#64748B" />}
        onChangeText={setQuery}
        onSubmitEditing={search}
      />
      <Field label="검색 범위">
        <InputBox value="전체" right={<RecordIcon name="chevron-right" size={18} color="#64748B" />} />
      </Field>
      <Field label="기간">
        <InputBox value="전체" right={<RecordIcon name="chevron-right" size={18} color="#64748B" />} />
      </Field>
      <Text style={styles.sectionLabel}>{results.length > 0 ? "검색 결과" : "최근 검색어"}</Text>
      {results.length > 0
        ? results.map((item) => (
            <View key={item.id} style={styles.recentSearchRow}>
              <RecordIcon name="timeline" size={16} color="#64748B" />
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                {item.body ? <Text style={styles.rowSubtitle}>{item.body}</Text> : null}
              </View>
            </View>
          ))
        : ["수유", "열", "감기", "예방접종"].map((item) => (
            <View key={item} style={styles.recentSearchRow}>
              <RecordIcon name="timeline" size={16} color="#64748B" />
              <Text style={styles.rowTitle}>{item}</Text>
            </View>
          ))}
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  phone: {
    flex: 1,
    width: "100%",
    maxWidth: 390,
    height: "100%",
    position: "relative",
    backgroundColor: "#FFFFFF",
  },
  scroll: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  screenContent: {
    gap: 18,
    minHeight: 820,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 120,
  },
  header: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
  },
  headerSlot: {
    width: 58,
    minHeight: 38,
    justifyContent: "center",
    zIndex: 1,
  },
  headerSlotLeft: {
    alignItems: "flex-start",
  },
  headerSlotRight: {
    alignItems: "flex-end",
  },
  headerCenter: {
    position: "absolute",
    left: 58,
    right: 58,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: text,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  headerAction: {
    color: primary,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
  },
  destructiveText: {
    color: "#EF4444",
  },
  sectionLabel: {
    color: text,
    fontSize: 13,
    fontWeight: "700",
  },
  appInfoHero: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    backgroundColor: "#F8FAFC",
    padding: 16,
  },
  appInfoHeroCopy: {
    flex: 1,
    gap: 5,
  },
  appInfoTitle: {
    color: text,
    fontSize: 20,
    fontWeight: "800",
  },
  appInfoDescription: {
    color: muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  legalIntroCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    backgroundColor: "#F8FAFC",
    padding: 16,
  },
  legalIntroText: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  legalSection: {
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    paddingBottom: 16,
  },
  legalSectionTitle: {
    color: text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "800",
  },
  legalParagraph: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  alarmCard: {
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    padding: 12,
  },
  notificationSettingsIntro: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CDEDE8",
    backgroundColor: "#F8FCFB",
    padding: 14,
  },
  notificationSettingsIntroIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: paleBlue,
  },
  notificationSettingsIntroCopy: {
    flex: 1,
    gap: 4,
  },
  notificationSettingsIntroTitle: {
    color: text,
    fontSize: 15,
    fontWeight: "800",
  },
  notificationSettingsIntroBody: {
    color: muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  recordReminderGroup: {
    gap: 10,
  },
  recordReminderDetails: {
    gap: 14,
    marginLeft: 18,
    borderLeftWidth: 2,
    borderLeftColor: "#CDEDE8",
    paddingLeft: 16,
  },
  recordShareLoading: {
    color: muted,
    fontSize: 12,
    fontWeight: "600",
  },
  recordShareRecipients: {
    gap: 10,
  },
  recordShareRecipientsHeader: {
    gap: 4,
  },
  recordShareHint: {
    color: muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  recordShareRecipientRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recordShareRecipientChip: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  recordShareRecipientChipActive: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FFF1F2",
  },
  recordShareRecipientText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  recordShareRecipientTextActive: {
    color: "#B91C1C",
  },
  field: {
    gap: 9,
  },
  fieldLabel: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  inputBox: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  textAreaBox: {
    minHeight: 104,
    alignItems: "flex-start",
    paddingTop: 12,
  },
  inputText: {
    flex: 1,
    color: text,
    fontSize: 14,
    fontWeight: "700",
  },
  readOnlyValue: {
    minHeight: 48,
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: soft,
    paddingHorizontal: 12,
  },
  readOnlyValueText: {
    color: muted,
    fontSize: 14,
    fontWeight: "700",
  },
  personalInfoPasswordSection: {
    gap: 4,
    paddingTop: 6,
  },
  personalInfoHint: {
    color: muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  textAreaText: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  inputRight: {
    alignItems: "center",
    justifyContent: "center",
  },
  pickerInputBox: {
    flexDirection: "row",
    alignItems: "center",
  },
  pickerValueText: {
    flex: 1,
    color: text,
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  timePickerFooter: {
    gap: 10,
    paddingTop: 2,
  },
  timePickerHeader: {
    height: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timePickerLabel: {
    color: muted,
    fontSize: 12,
    fontWeight: "700",
  },
  timePickerValue: {
    color: text,
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timeStepperRow: {
    flexDirection: "row",
    gap: 8,
  },
  timeStepButton: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#F3F6FB",
  },
  timeStepText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
  },
  quickTimeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  quickTimeChip: {
    minWidth: 58,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDE7E2",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  quickTimeChipActive: {
    borderColor: primary,
    backgroundColor: paleBlue,
  },
  quickTimeText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  quickTimeTextActive: {
    color: primary,
  },
  pickerDoneButton: {
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: primary,
  },
  pickerDoneText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  inputUnit: {
    color: muted,
    fontSize: 13,
    fontWeight: "800",
  },
  primaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: primary,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  actionStatus: {
    color: muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  outlineButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: "#FFFFFF",
  },
  outlineDanger: {
    borderColor: "#FECACA",
  },
  outlineButtonText: {
    color: primary,
    fontSize: 14,
    fontWeight: "700",
  },
  segmented: {
    minHeight: 44,
    flexDirection: "row",
    gap: 8,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: "#FFFFFF",
  },
  segmentActive: {
    borderColor: primary,
    backgroundColor: primary,
  },
  segmentText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    minWidth: 75,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  chipActive: {
    borderColor: primary,
    backgroundColor: primary,
  },
  chipText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  photoAddBox: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: "#FFFFFF",
  },
  photoAddText: {
    color: primary,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: "400",
  },
  listRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },
  rowIcon: {
    width: 32,
    alignItems: "center",
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: text,
    fontSize: 14,
    fontWeight: "700",
  },
  rowSubtitle: {
    color: muted,
    fontSize: 12,
    fontWeight: "700",
  },
  badge: {
    borderRadius: 7,
    backgroundColor: paleBlue,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: {
    color: primary,
    fontSize: 11,
    fontWeight: "700",
  },
  memberRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  centerPhotoBlock: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  childDdayPill: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: paleBlue,
    paddingHorizontal: 14,
  },
  childDdayText: {
    color: primary,
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  cameraPill: {
    marginTop: -22,
    marginLeft: 62,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: primary,
  },
  temperatureControl: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  roundStep: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#DDE6FF",
    color: primary,
    textAlign: "center",
    fontSize: 24,
    lineHeight: 35,
    fontWeight: "400",
  },
  temperatureValue: {
    color: text,
    fontSize: 32,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 88,
    padding: 0,
    textAlign: "center",
  },
  detailIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailTitle: {
    color: text,
    fontSize: 16,
    fontWeight: "700",
  },
  detailLine: {
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    paddingBottom: 14,
  },
  detailValue: {
    color: text,
    fontSize: 14,
    fontWeight: "600",
  },
  mutedText: {
    color: "#AEB7C5",
  },
  rangeText: {
    color: "#334155",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  detailDateControl: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateStepButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  detailRangePickerButton: {
    minWidth: 168,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  detailRangePickerButtonActive: {
    borderColor: "#BFE6DF",
    backgroundColor: "#F6FBFA",
  },
  metricHeader: {
    gap: 8,
  },
  metricTitle: {
    color: text,
    fontSize: 14,
    fontWeight: "700",
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  metricValue: {
    color: text,
    fontSize: 28,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  metricMeta: {
    color: muted,
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statsEmptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    backgroundColor: "#F8FAFC",
    padding: 18,
    gap: 6,
    alignItems: "center",
  },
  statsEmptyChart: {
    minHeight: 156,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    gap: 6,
    marginBottom: 18,
  },
  statsEmptyTitle: {
    color: "#26364D",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  statsEmptyDescription: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  barChart: {
    height: 230,
    overflow: "hidden",
  },
  giftedChartWrap: {
    height: 230,
    overflow: "hidden",
  },
  chartAxisText: {
    color: "#8A94A8",
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  barColumn: {
    width: 32,
    alignItems: "center",
    gap: 7,
  },
  bar: {
    width: 20,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: "#78C9BF",
  },
  barValue: {
    color: "#7E94C8",
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  axisText: {
    color: "#8A94A8",
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  lineChartLite: {
    height: 230,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  lineRuleTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 52,
    height: 1,
    backgroundColor: "#EAF2EF",
  },
  lineRuleMid: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 112,
    height: 1,
    backgroundColor: "#EAF2EF",
  },
  lineRuleBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 44,
    height: 1,
    backgroundColor: "#EAF2EF",
  },
  linePath: {
    position: "relative",
    height: 190,
  },
  lineDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: primary,
  },
  lineLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  donutRow: {
    minHeight: 230,
    flexDirection: "row",
    alignItems: "center",
    gap: 28,
  },
  donutOuter: {
    width: 145,
    height: 145,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 34,
    borderColor: primary,
    backgroundColor: "#7ED3D0",
  },
  donutCutout: {
    width: 76,
    height: 76,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  legend: {
    gap: 16,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  legendText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },
  growthChartBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAF2EF",
    padding: 8,
  },
  toggleRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleRowActive: {
    borderColor: "#CDEDE8",
    backgroundColor: "#FBFDFF",
  },
  toggleRowDisabled: {
    opacity: 0.65,
  },
  toggleRowIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#F3F7FB",
  },
  toggleTrackHitArea: {
    borderRadius: 999,
  },
  toggleTrack: {
    width: 50,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    boxShadow: "0 2px 7px rgba(15, 23, 42, 0.16)",
    transform: [{ translateX: 0 }],
  },
  timeValue: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  centerHero: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 36,
  },
  heroTitle: {
    color: text,
    fontSize: 14,
    fontWeight: "700",
  },
  footerNote: {
    color: muted,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
  },
  checkRow: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkMark: {
    marginLeft: "auto",
    color: primary,
    fontSize: 14,
    fontWeight: "700",
  },
  albumSection: {
    gap: 9,
  },
  albumActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  albumActionButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFE4DF",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  albumActionButtonActive: {
    backgroundColor: "#F0FAF8",
  },
  albumActionButtonText: {
    color: "#16877D",
    fontSize: 12,
    fontWeight: "700",
  },
  albumDeleteButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    paddingHorizontal: 12,
  },
  albumDeleteButtonDisabled: {
    backgroundColor: "#FCA5A5",
  },
  albumDeleteButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoTile: {
    width: "31.5%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: soft,
    overflow: "hidden",
  },
  photoTileReadOnly: {
    opacity: 0.55,
  },
  photoTileSelected: {
    borderWidth: 2,
    borderColor: primary,
  },
  albumPhotoImage: {
    width: "100%",
    height: "100%",
  },
  albumSelectionBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  albumSelectionBadgeSelected: {
    backgroundColor: primary,
  },
  albumDeleteModalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    paddingHorizontal: 24,
  },
  albumDeleteModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  albumDeleteDialog: {
    width: "100%",
    maxWidth: 340,
    gap: 8,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 20,
  },
  albumDeleteDialogTitle: {
    color: text,
    fontSize: 17,
    fontWeight: "800",
  },
  albumDeleteDialogBody: {
    color: muted,
    fontSize: 13,
    fontWeight: "600",
  },
  albumDeleteDialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  albumDialogCancelButton: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    paddingHorizontal: 14,
  },
  albumDialogCancelText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  albumDialogDeleteButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    paddingHorizontal: 14,
  },
  albumDialogDeleteText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  recentSearchRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
