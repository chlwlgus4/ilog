import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Alert,
  AppState,
  BackHandler,
  Easing,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type KeyboardTypeOptions,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Image as CachedImage } from "expo-image";
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
  createFamilyChatMessage,
  clearFamilyChatPresence,
  createGrowthMeasurement,
  createHospitalVisit,
  createLog,
  createVaccination,
  cancelFamilyDeletion,
  deleteFamilyPhoto,
  fetchGrowthMeasurements,
  fetchFamilyChatMessage,
  fetchHospitalVisits,
  fetchLogs,
  fetchPhotoAlbum,
  fetchRecordDetail,
  getCachedPhotoAlbum,
  fetchSettings,
  fetchVaccinations,
  getAccountDeletionAuthMethods,
  requestAccountDeletion,
  recordDetailTypes,
  restoreSession,
  searchFamilyRecords,
  touchFamilyChatPresence,
  updateChildProfile,
  updateCaregiverPersonalInfo,
  updateNotificationPreferences,
  upsertRecordAlarmRule,
  type AlarmNotifyScope,
  type AccountDeletionAuthMethods,
  type CaregiverRole,
  type CaregiverSummary,
  type ChildGender,
  type CreateLogRequest,
  type CreateFamilyChatMessageRequest,
  type FamilyPhotoCard,
  type FamilyChatMessageCard,
  type GrowthMeasurementCard,
  type HospitalVisitCard,
  type LogCard,
  type LogType,
  type NotificationPreferencesSummary,
  type RecordAlarmRuleCard,
  type RecordDetail,
  type RecordDetailSource,
  type RecordDetailType,
  type SearchResultCard,
  type SessionResponse,
  type VaccinationCard,
  APPLE_ACCESS_REVOCATION_GUIDE_URL,
} from "../api";
import { caregiverRoleOptions, childGenderLabel, logTypeLabel, nicknameForRoleChange, roleDefaultNickname, roleLabel } from "../constants";
import { useBabyBossAppContext } from "../hooks/BabyBossAppContext";
import { ProfileImageField } from "../features/shared/ProfileImageField";
import { formatChildAge } from "../features/shared/childAge";
import {
  buildFeedingRecordData,
  feedingMethodOptions,
  feedingMetricForLog,
  feedingUnitLabel,
  summarizeFeedingLogs,
} from "../features/shared/feedingRecord";
import { getRecordAgeGuidance, type RecordAgeGuidanceCategory } from "../features/shared/recordAgeGuidance";
import { FamilyChatView } from "../features/chat/FamilyChatView";
import { AuthCaptcha } from "../features/auth/AuthCaptcha";
import {
  isAuthCaptchaCancelled,
  runAuthCaptcha,
  type AuthCaptchaHandle,
} from "../features/auth/authCaptchaTypes";
import { showAppAlert, useAppAlert } from "../features/shared/appAlerts";
import { FamilyImagePreviewModal } from "../features/shared/FamilyImagePreviewModal";
import { SafetyActions, SafetyStateNotice } from "../features/safety/SafetyActions";
import { useContentSafetyState } from "../features/safety/useContentSafetyState";
import { isSafetyTargetHidden, type SafetyTarget } from "../features/safety/safetyPolicy";
import { FamilyPhotoSourceModal } from "../features/shared/FamilyPhotoSourceModal";
import { downloadFamilyPhotos } from "../features/shared/photoDownload";
import {
  pickFamilyPhotoAssets,
  uploadFamilyPhotoAssets,
  type FamilyPhotoPickerSource,
} from "../features/shared/familyPhotoUpload";
import {
  isDirectFamilyAlbumPhoto,
  groupPhotoAlbumPhotos,
  PHOTO_ALBUM_OPERATION_CONCURRENCY,
  removeDeletedAlbumPhotos,
  runPhotoAlbumOperations,
  togglePhotoSelection,
  type PhotoAlbumGrouping,
} from "../features/shared/photoAlbumUtils";
import { legalDocumentVersions } from "../legalDocuments";
import { buildSupportEmailUrl, SUPPORT_EMAIL } from "../features/settings/supportEmail";
import {
  configurableRecordReminderLogTypes,
  defaultRecordAlarmIntervals,
} from "../features/shared/recordReminderDefaults";
import { RecordIcon, type RecordIconName } from "../features/shared/RecordIcon";
import { getFamilyInviteLink, normalizeFamilyInviteCode } from "../features/shared/familyInviteLinks";
import {
  canLeaveFamily,
  formatFamilyDeletionDate,
  isFamilyDeletionOwner,
} from "../features/settings/accountDeletion";
import { scheduleLocalRecordAlarmNotification } from "../serverless/pushNotifications";
import { FONT_FAMILY } from "../typography";
import { brandColors } from "../theme";

const primary = brandColors.primary;
const text = brandColors.ink;
const muted = brandColors.muted;
const border = "#E9EDF3";
const soft = brandColors.surface;
const paleBlue = brandColors.tint;
const familyChatPresenceHeartbeatMs = 15_000;

function confirmAccountDeletionAction({
  title,
  message,
  confirmLabel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: "취소", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

function showAppleManualRevocationAction(title: string, message: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (window.confirm(`${title}\n\n${message}\n\n확인을 누르면 Apple 연결 해제 방법을 엽니다.`)) {
      void openAppleAccessRevocationGuide();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: "나중에", style: "cancel" },
    { text: "연결 해제 방법", onPress: () => void openAppleAccessRevocationGuide() },
  ]);
}

async function loadAccountDeletionScreenContext() {
  const session = await restoreSession();
  const [settings, authMethods] = await Promise.all([
    fetchSettings(session.family.id),
    getAccountDeletionAuthMethods(),
  ]);

  return { session, caregivers: settings.caregivers, authMethods };
}

type BackTarget = "/home" | "/quick-add" | "/settings" | "/timeline" | "/statistics" | "/growth" | "/app-info" | "/privacy";

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
const photoAlbumGroupingOptions: { key: PhotoAlbumGrouping; label: string }[] = [
  { key: "year", label: "년" },
  { key: "month", label: "월" },
  { key: "day", label: "일" },
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
    title: "맘마 통계",
    metricTitle: "같은 방식 기록 합계",
    chart: "bar",
    emptyValue: "기록 없음",
  },
  sleep: {
    testID: "screen-sleep-stats",
    title: "잠 통계",
    metricTitle: "총 잠 시간",
    chart: "line",
    emptyValue: "0분",
  },
  diaper: {
    testID: "screen-diaper-stats",
    title: "기저귀 통계",
    metricTitle: "총 기저귀 기록",
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
    setMessage(null);

    try {
      const session = await restoreSession();
      await work(session);
      setMessage(successMessage);
    } catch (error) {
      setMessage(null);
      showAppAlert(error instanceof Error ? error.message : "저장하지 못했어요.");
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
    case "feeding": {
      return summarizeFeedingLogs(logs)?.value ?? `${logs.length} 회`;
    }
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
  const chartLogs = kind === "feeding" ? (summarizeFeedingLogs(logs)?.logs ?? []) : logs;

  chartLogs.forEach((log) => {
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
      return feedingMetricForLog(log)?.value ?? null;
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
  const caregivers = (app.settings?.caregivers ?? app.bootstrap?.caregivers ?? [])
    .filter((caregiver) => caregiver.id !== app.session?.caregiver.id);
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
    }).catch(() => {
      console.warn("Failed to schedule local record alarm notification.");
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
        caregivers.length > 0 ? (
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
        ) : (
          <Text style={styles.recordShareLoading}>알림을 받을 다른 보호자가 아직 없어요.</Text>
        )
      ) : null}
    </View>
  );
}

function recordAlarmLabel(logType: LogType) {
  switch (logType) {
    case "FEEDING":
      return "맘마";
    case "SLEEP":
      return "잠";
    case "DIAPER":
      return "기저귀";
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
      <Pressable
        style={[styles.headerSlot, styles.headerSlotLeft]}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="이전 화면"
        testID={`back-${slugify(title)}`}>
        <RecordIcon name="back-arrow" size={20} color="#1F2937" strokeWidth={2.1} />
      </Pressable>
      <View style={styles.headerCenter}>
        {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
      </View>
      {action ? (
        <Pressable
          style={[styles.headerSlot, styles.headerSlotRight]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={action}
          testID={actionTestID}>
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

function RecordAgeGuidance({
  category,
  feedingMethod,
}: {
  category: RecordAgeGuidanceCategory;
  feedingMethod?: string | null;
}) {
  const app = useBabyBossAppContext();
  const latestWeightKg = app.growthMeasurements.find((measurement) => measurement.weightKg != null)?.weightKg ?? null;
  const latestHeightCm = app.growthMeasurements.find((measurement) => measurement.heightCm != null)?.heightCm ?? null;
  const guidance = getRecordAgeGuidance({
    category,
    birthDate: app.session?.child?.birthDate,
    feedingMethod,
    gender: app.session?.child?.gender,
    weightKg: latestWeightKg,
    heightCm: latestHeightCm,
  });

  return (
    <View style={styles.recordAgeGuidance} testID={`record-age-guidance-${category.toLowerCase()}`}>
      <View style={styles.recordAgeGuidanceHeader}>
        <View style={styles.recordAgeGuidanceIcon}>
          <RecordIcon name={recordAgeGuidanceIcon(category)} size={20} color={primary} />
        </View>
        <View style={styles.recordAgeGuidanceCopy}>
          <Text style={styles.recordAgeGuidanceTitle}>{recordAgeGuidanceCategoryLabel(category)} 맞춤 팁</Text>
          <Text style={styles.recordAgeGuidanceEyebrow}>{guidance.eyebrow}</Text>
        </View>
      </View>
      <View style={styles.recordAgeGuidanceDivider} />
      <View style={styles.recordAgeGuidanceBody}>
        <Text style={styles.recordAgeGuidanceHeadline}>{guidance.headline}</Text>
        <Text style={styles.recordAgeGuidanceDetail}>{guidance.detail}</Text>
      </View>
      <View style={styles.recordAgeGuidanceCautionRow}>
        <Text style={styles.recordAgeGuidanceCautionLabel}>꼭 확인</Text>
        <Text style={styles.recordAgeGuidanceCaution}>{guidance.caution}</Text>
      </View>
    </View>
  );
}

function recordAgeGuidanceCategoryLabel(category: RecordAgeGuidanceCategory) {
  switch (category) {
    case "FEEDING":
      return "맘마";
    case "SLEEP":
      return "잠";
    case "DIAPER":
      return "기저귀";
    case "TEMPERATURE":
      return "체온";
    case "MEDICINE":
      return "약/영양제";
    case "PUMPING":
      return "유축";
    case "GROWTH":
      return "성장";
    case "VACCINATION":
      return "예방접종";
    case "HOSPITAL":
      return "병원 방문";
  }
}

function recordAgeGuidanceIcon(category: RecordAgeGuidanceCategory): RecordIconName {
  switch (category) {
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
    case "GROWTH":
      return "growth";
    case "VACCINATION":
      return "vaccine";
    case "HOSPITAL":
      return "hospital";
  }
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

const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);
const minuteOptions = Array.from({ length: 60 }, (_, minute) => minute);

function TimeDropdown({
  label,
  value,
  options,
  suffix,
  expanded,
  onToggle,
  onSelect,
  testID,
}: {
  label: string;
  value: number;
  options: readonly number[];
  suffix: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (value: number) => void;
  testID: string;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, value - 2) * 36, animated: false });
    });
  }, [expanded, value]);

  return (
    <View style={styles.timeDropdownColumn}>
      <Text style={styles.timeDropdownLabel}>{label}</Text>
      <Pressable
        style={[styles.timeDropdownButton, expanded && styles.timeDropdownButtonOpen]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${label} 선택`}
        accessibilityState={{ expanded }}
        testID={`${testID}-select`}
      >
        <Text style={styles.timeDropdownValue}>{`${`${value}`.padStart(2, "0")}${suffix}`}</Text>
        <RecordIcon name="chevron-down" size={17} color="#64748B" strokeWidth={2.2} />
      </Pressable>
      {expanded ? (
        <View style={styles.timeDropdownMenu} testID={`${testID}-menu`}>
          <ScrollView
            ref={scrollRef}
            style={styles.timeDropdownScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {options.map((option) => {
              const selected = option === value;
              return (
                <Pressable
                  key={option}
                  style={[styles.timeDropdownOption, selected && styles.timeDropdownOptionSelected]}
                  onPress={() => onSelect(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`${testID}-${`${option}`.padStart(2, "0")}`}
                >
                  <Text style={[styles.timeDropdownOptionText, selected && styles.timeDropdownOptionTextSelected]}>
                    {`${`${option}`.padStart(2, "0")}${suffix}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
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
  const [openTimeDropdown, setOpenTimeDropdown] = useState<"hour" | "minute" | null>(null);
  const selectedDate = parseDateTimeValue(value);
  const [displayMonth, setDisplayMonth] = useState(selectedDate);

  useEffect(() => {
    if (open) {
      setDisplayMonth(selectedDate);
    } else {
      setOpenTimeDropdown(null);
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
            <View style={styles.timeDropdownRow}>
              <TimeDropdown
                label="시"
                value={selectedDate.getHours()}
                options={hourOptions}
                suffix="시"
                expanded={openTimeDropdown === "hour"}
                onToggle={() => setOpenTimeDropdown((current) => current === "hour" ? null : "hour")}
                onSelect={(hour) => {
                  onChange(setDateTimeClock(value, hour, selectedDate.getMinutes()));
                  setOpenTimeDropdown(null);
                }}
                testID={`${testID}-hour`}
              />
              <TimeDropdown
                label="분"
                value={selectedDate.getMinutes()}
                options={minuteOptions}
                suffix="분"
                expanded={openTimeDropdown === "minute"}
                onToggle={() => setOpenTimeDropdown((current) => current === "minute" ? null : "minute")}
                onSelect={(minute) => {
                  onChange(setDateTimeClock(value, selectedDate.getHours(), minute));
                  setOpenTimeDropdown(null);
                }}
                testID={`${testID}-minute`}
              />
            </View>
            <Pressable style={styles.pickerDoneButton} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="시간 선택 확인">
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
      <Pressable
        style={[styles.inputBox, styles.pickerInputBox]}
        onPress={() => setOpen(true)}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${title} 선택`}>
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
    <Pressable
      style={[styles.primaryButton, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function OutlineButton({
  label,
  danger,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      style={[
        styles.outlineButton,
        danger && styles.outlineDanger,
        disabled && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Text style={[styles.outlineButtonText, danger && styles.destructiveText]}>{label}</Text>
    </Pressable>
  );
}

const supportEmail = SUPPORT_EMAIL;
const operatorName = "초이";
const operatorRepresentative = "최지현";
const operatorBusinessRegistrationNumber = "360-64-00637";
const operatorDisplayName = `${operatorName}(대표자: ${operatorRepresentative}, 서비스명: 아이로그)`;
const termsEffectiveDate = "2026년 9월 3일";
const privacyEffectiveDate = "2026년 9월 3일";

async function openSupportEmail(subject: string, body = "") {
  const url = buildSupportEmailUrl(subject, body);

  try {
    await Linking.openURL(url);
  } catch {
    showAppAlert(`${supportEmail}로 문의해 주세요.`, "메일 앱을 열지 못했어요");
  }
}

async function openAppleAccessRevocationGuide() {
  try {
    await Linking.openURL(APPLE_ACCESS_REVOCATION_GUIDE_URL);
  } catch {
    showAppAlert(
      "iPhone 설정에서 [사용자 이름] > Apple로 로그인 > 아이로그 > 삭제 순서로 연결을 직접 해제해 주세요.",
      "Apple 연결을 해제해 주세요",
    );
  }
}

function Segmented({ options }: { options: SegmentOption[] }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable
          key={option.label}
          style={[styles.segment, option.active && styles.segmentActive]}
          onPress={option.onPress}
          disabled={!option.onPress}
          testID={option.testID}
          accessibilityRole="button"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: Boolean(option.active), disabled: !option.onPress }}
        >
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
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: active === index, disabled: !onSelect }}
        >
          <Text style={[styles.chipText, active === index && styles.chipTextActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ListRow({
  title,
  subtitle,
  badge,
  icon,
  onPress,
  action,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  icon?: RecordIconName;
  onPress?: () => void;
  action?: ReactNode;
}) {
  const content = (
    <>
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
      {action}
    </>
  );

  if (!onPress) {
    return <View style={styles.listRow}>{content}</View>;
  }

  return (
    <Pressable
      style={styles.listRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, badge].filter(Boolean).join(", ")}
    >
      {content}
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
      outputRange: ["#EEF3F8", brandColors.action],
    }),
    borderColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: ["#DDE5EF", brandColors.actionPressed],
    }),
  };
  const thumbStyle = {
    backgroundColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [brandColors.onAction, brandColors.onAction],
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
  return <FamilyManagementRoute />;
}

export function FamilyManagementRoute() {
  const back = useFallbackBack("/settings");
  const app = useBabyBossAppContext();
  const safety = useContentSafetyState();
  const [caregivers, setCaregivers] = useState<CaregiverSummary[]>([]);
  const [loadMessage, setLoadMessage] = useState<string | null>("가족 정보를 불러오는 중...");
  const [message, setMessage] = useState<string | null>(null);
  const inviteCode = app.session?.family.inviteCode ?? app.currentFamily?.inviteCode ?? "";
  const inviteLink = useMemo(() => getFamilyInviteLink(inviteCode), [inviteCode]);

  useEffect(() => {
    let isActive = true;
    setCaregivers([]);

    async function loadFamily() {
      try {
        const session = await restoreSession();
        const settings = await fetchSettings(session.family.id);

        if (isActive) {
          setCaregivers(settings.caregivers);
          setLoadMessage(null);
        }
      } catch (error) {
        if (isActive) {
          setLoadMessage(null);
          showAppAlert(error instanceof Error ? error.message : "가족 정보를 불러오지 못했어요.");
        }
      }
    }

    void loadFamily();

    return () => {
      isActive = false;
    };
  }, [app.session?.family.id, app.session?.caregiver.id]);

  async function copyInviteValue(value: string, label: string) {
    if (!inviteCode) {
      showAppAlert("가족 초대 정보를 아직 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }

    try {
      await Clipboard.setStringAsync(value);
      setMessage(`${label}를 복사했어요.`);
    } catch {
      showAppAlert(`${label}를 복사하지 못했어요. 다시 시도해 주세요.`);
    }
  }

  return (
    <SpecShell testID="screen-family-management">
      <Header title="가족 관리" onBack={back} />
      <Text style={styles.sectionLabel}>가족 구성원</Text>
      {caregivers.map((caregiver) => (
        <MemberRow
          key={caregiver.id}
          name={caregiver.name}
          subtitle={safety.blockedCaregiverIds.includes(caregiver.id) ? "접촉 차단 중 · 가족 권한 유지" : "가족 구성원"}
          badge={caregiver.imageUrl ? "프로필" : "연결됨"}
          imageUrl={caregiver.imageUrl}
          action={<SafetyActions target={{ type: "CAREGIVER", id: caregiver.id, displayName: caregiver.name }} currentCaregiverId={app.session?.caregiver.id} testID={`family-member-safety-${caregiver.id}`} />}
        />
      ))}
      <ActionStatus message={loadMessage} />
      <View style={styles.familyInviteSection}>
        <Text style={styles.sectionLabel}>가족 초대</Text>
        <Text style={styles.familyInviteDescription}>가족에게 링크 또는 코드를 보내면 같은 가족 공간에 참여할 수 있어요.</Text>
        <View style={styles.familyInviteActions}>
          <Pressable
            style={[styles.familyInviteActionButton, !inviteCode && styles.familyInviteActionButtonDisabled]}
            onPress={() => void copyInviteValue(inviteLink, "초대 링크")}
            disabled={!inviteCode}
            accessibilityRole="button"
            testID="family-invite-copy-link">
            <RecordIcon name="copy" size={18} color={primary} strokeWidth={2.1} />
            <Text style={styles.familyInviteActionButtonText}>초대 링크 복사</Text>
          </Pressable>
          <Pressable
            style={[styles.familyInviteActionButton, !inviteCode && styles.familyInviteActionButtonDisabled]}
            onPress={() => void copyInviteValue(inviteCode, "가족 초대 코드")}
            disabled={!inviteCode}
            accessibilityRole="button"
            testID="family-invite-copy-code">
            <RecordIcon name="copy" size={18} color={primary} strokeWidth={2.1} />
            <Text style={styles.familyInviteActionButtonText}>초대 코드 복사</Text>
          </Pressable>
        </View>
        <ActionStatus message={message} />
      </View>
    </SpecShell>
  );
}

function MemberRow({ name, subtitle, badge, imageUrl, action }: { name: string; subtitle: string; badge: string; imageUrl?: string | null; action?: ReactNode }) {
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
      {action}
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
  const [gender, setGender] = useState<ChildGender | null>(() => sessionChild?.gender ?? null);
  const latestWeightKg = app.growthMeasurements.find((measurement) => measurement.weightKg != null)?.weightKg ?? null;
  const [weightKg, setWeightKg] = useState(() => (latestWeightKg == null ? "" : `${latestWeightKg}`));
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
          setGender(child.gender ?? null);
          setWeightKg(latestWeightKg == null ? "" : `${latestWeightKg}`);
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
  }, [app.session, sessionChild, latestWeightKg]);

  const childAgeLabel = formatChildAge(birthDate);
  const parsedWeightKg = parseMeasurement(weightKg);
  const canSave = Boolean(loadedChild && name.trim() && isValidDateOnlyValue(birthDate) && gender && parsedWeightKg) && !action.busy;

  const save = () => {
    if (!canSave || !gender || parsedWeightKg === null) {
      return;
    }

    return action.run(async (session) => {
      await updateChildProfile(requireSessionChild(session).id, {
        name,
        birthDate,
        gender,
        ...(latestWeightKg == null || Math.abs(latestWeightKg - parsedWeightKg) > 0.001 ? { weightKg: parsedWeightKg } : {}),
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
        <ProfileImageField size={88} imageUrl={imageUrl} editable={!action.busy} onChangeImage={handleImageChange} testID="child-profile-image" />
        <View style={styles.childDdayPill} testID="child-info-dday">
          <Text style={styles.childDdayText}>{childAgeLabel ? `생후 ${childAgeLabel}` : "생년월일을 입력해 주세요."}</Text>
        </View>
      </View>
      <Field label="이름">
        <InputBox value={name} onChangeText={setName} testID="child-info-name-input" />
      </Field>
      <Field label="생년월일">
        <DatePickerField value={birthDate} onChange={setBirthDate} title="생년월일 선택" testID="child-birth-date-picker" />
      </Field>
      <Field label="성별">
        <ChipRow
          labels={(["MALE", "FEMALE"] as ChildGender[]).map((item) => childGenderLabel[item])}
          active={gender === "MALE" ? 0 : gender === "FEMALE" ? 1 : -1}
          onSelect={(_, index) => setGender(index === 0 ? "MALE" : "FEMALE")}
        />
      </Field>
      <Field label="현재 몸무게">
        <InputBox
          value={weightKg}
          placeholder="예: 7.5"
          onChangeText={setWeightKg}
          keyboardType="decimal-pad"
          right={<Text style={styles.inputUnit}>kg</Text>}
          testID="child-weight-input"
        />
      </Field>
      <PrimaryButton label="저장" onPress={save} disabled={!canSave} />
      <ActionStatus message={action.message} />
    </SpecShell>
  );
}

export function FeedingAddRoute() {
  const back = useHomeBack();
  const action = useSaveAndNavigateAction("맘마 기록을 저장했어요.", "/timeline");
  const [amount, setAmount] = useState("");
  const [methodIndex, setMethodIndex] = useState<number | null>(null);
  const [breastSideIndex, setBreastSideIndex] = useState<number | null>(null);
  const [foodName, setFoodName] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => toDateTimeInputValue());
  const [note, setNote] = useState("");
  const [alarm, setAlarm] = useState(() => createRecordAlarmState("FEEDING"));
  const recordShare = useRecordShareForm();
  const breastSideOptions = ["왼쪽", "오른쪽", "양쪽"];
  const method = methodIndex === null ? null : feedingMethodOptions[methodIndex] ?? null;
  const breastSide = breastSideIndex === null ? null : breastSideOptions[breastSideIndex];
  const recordData = buildFeedingRecordData({
    method: method?.key ?? null,
    measurement: amount,
    breastSide,
    foodName,
  });
  const canSave = Boolean(recordData) && recordShare.ready && !action.busy;
  const save = () => {
    if (!canSave || !recordData) {
      return;
    }

    return action.run((session) =>
      createLogWithLocalRecordAlarm(session.family.id, {
        type: "FEEDING",
        value: recordData.value,
        note,
        childId: requireSessionChild(session).id,
        recordedAt: toRecordedAt(recordedAt),
        recordSubtype: recordData.recordSubtype,
        details: recordData.details,
        ...toRecordSharePayload(recordShare.state),
        ...toRecordAlarmPayload(alarm),
      }),
    );
  };

  return (
    <SpecShell testID="screen-feeding-add">
      <Header title="맘마" onBack={back} />
      <Field label="맘마 방법">
        <ChipRow
          labels={feedingMethodOptions.map((option) => option.label)}
          active={methodIndex ?? -1}
          onSelect={(_, index) => {
            setMethodIndex(index);
            setAmount("");
            setBreastSideIndex(null);
            setFoodName("");
          }}
        />
      </Field>
      <RecordAgeGuidance category="FEEDING" feedingMethod={method?.key} />
      {method ? (
        <Field label={method.inputLabel}>
          <InputBox
            value={amount}
            placeholder={method.inputPlaceholder}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            right={<Text style={styles.inputUnit}>{feedingUnitLabel(method.unit)}</Text>}
            testID="feeding-amount-input"
          />
        </Field>
      ) : null}
      {method?.key === "BREAST" ? (
        <Field label="먹인 쪽">
          <ChipRow labels={breastSideOptions} active={breastSideIndex ?? -1} onSelect={(_, index) => setBreastSideIndex(index)} />
        </Field>
      ) : null}
      {method?.key === "SOLID" ? (
        <Field label="식재료 또는 메뉴 (선택)">
          <InputBox value={foodName} placeholder="예: 쌀미음" onChangeText={setFoodName} testID="feeding-food-name-input" />
        </Field>
      ) : null}
      <Field label="기록 시간">
        <DateTimePickerField value={recordedAt} onChange={setRecordedAt} title="맘마 시간 선택" testID="feeding-recorded-at-picker" />
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
  const action = useSaveAndNavigateAction("잠 기록을 저장했어요.", "/timeline");
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
      <Header title="잠" onBack={back} />
      <RecordAgeGuidance category="SLEEP" />
      <Field label="시작 시간">
        <DateTimePickerField value={startAt} onChange={setStartAt} title="잠 시작 시간 선택" testID="sleep-start-at-picker" />
      </Field>
      <Field label="종료 시간">
        <DateTimePickerField value={endAt} onChange={setEndAt} title="잠 종료 시간 선택" testID="sleep-end-at-picker" />
      </Field>
      <Field label="잠 유형">
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
  const action = useSaveAndNavigateAction("기저귀 기록을 저장했어요.", "/timeline");
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
      <Header title="기저귀" onBack={back} />
      <RecordAgeGuidance category="DIAPER" />
      <Field label="기저귀 상태">
        <ChipRow labels={statusOptions} active={statusIndex ?? -1} onSelect={(_, index) => setStatusIndex(index)} />
      </Field>
      <Field label="색상 (선택)">
        <ChipRow labels={colorOptions} active={colorIndex ?? -1} onSelect={(_, index) => setColorIndex(index)} />
      </Field>
      <Field label="기록 시간">
        <DateTimePickerField value={recordedAt} onChange={setRecordedAt} title="기저귀 교체 시간 선택" testID="diaper-recorded-at-picker" />
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
      <RecordAgeGuidance category="TEMPERATURE" />
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
      <RecordAgeGuidance category="MEDICINE" />
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
      <RecordAgeGuidance category="PUMPING" />
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
      <RecordAgeGuidance category="VACCINATION" />
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
      <RecordAgeGuidance category="HOSPITAL" />
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
  const router = useRouter();
  const app = useBabyBossAppContext();
  const safety = useContentSafetyState();
  const params = useLocalSearchParams<{
    recordType?: string | string[];
    recordId?: string | string[];
    recordSource?: string | string[];
    notificationTap?: string | string[];
  }>();
  const recordType = parseRecordDetailType(params.recordType);
  const recordId = parsePositiveRecordId(params.recordId);
  const recordSource = parseRecordDetailSource(params.recordSource);
  const notificationTap = Array.isArray(params.notificationTap) ? params.notificationTap[0] : params.notificationTap;
  const familyId = app.session?.family.id ?? null;
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(recordType && recordId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    let isActive = true;

    setDetail(null);
    setLoadError(null);

    if (!recordType || recordId == null) {
      setIsLoading(false);
      return () => {
        isActive = false;
      };
    }

    if (familyId == null || safety.status !== "ready") {
      setIsLoading(true);
      return () => {
        isActive = false;
      };
    }

    setIsLoading(true);
    fetchRecordDetail(familyId, recordType, recordId, recordSource)
      .then((recordDetail) => {
        if (isActive) {
          setDetail(recordDetail);
        }
      })
      .catch((error) => {
        if (isActive) {
          setLoadError(error instanceof Error ? error.message : "기록 상세를 불러오지 못했어요.");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [familyId, notificationTap, recordId, recordSource, recordType, retryAttempt, safety]);

  const back = () => router.replace(recordDetailBackRoute(recordType, recordSource, detail));
  const openGrowthCandidate = (source: RecordDetailSource) => {
    if (recordId == null) {
      return;
    }

    router.replace({
      pathname: "/timeline-detail",
      params: {
        recordType: "GROWTH",
        recordId: String(recordId),
        recordSource: source,
        ...(notificationTap ? { notificationTap } : {}),
      },
    });
  };

  return (
    <SpecShell testID="screen-timeline-detail">
      <Header title="기록 상세" onBack={back} />
      {safety.status !== "ready" ? <SafetyStateNotice state={safety} /> : !recordType || recordId == null ? (
        <RecordDetailState
          title="기록 정보를 확인할 수 없어요"
          description="알림에 올바른 기록 정보가 없어 기록 목록으로 돌아가 주세요."
          testID="timeline-detail-invalid"
        />
      ) : isLoading ? (
        <RecordDetailState
          title="기록을 불러오는 중이에요"
          description="알림에서 선택한 기록을 확인하고 있어요."
          testID="timeline-detail-loading"
        />
      ) : loadError ? (
        <RecordDetailState
          title="기록을 불러오지 못했어요"
          description={loadError}
          testID="timeline-detail-error"
          actionLabel="다시 시도"
          onAction={() => setRetryAttempt((current) => current + 1)}
        />
      ) : detail?.kind === "AMBIGUOUS_GROWTH" ? (
        <AmbiguousGrowthRecordDetailContent detail={detail} onSelect={openGrowthCandidate} />
      ) : detail ? (
        isSafetyTargetHidden(safety, recordSafetyTarget(detail).type, detail.record.id)
          ? <RecordDetailState title="숨겨진 기록이에요" description="신고 또는 안전 설정에 따라 이 기록을 표시하지 않아요." testID="timeline-detail-safety-hidden" />
          : <RecordDetailContent detail={detail} currentCaregiverId={app.session?.caregiver.id} />
      ) : (
        <RecordDetailState
          title="기록을 찾을 수 없어요"
          description="기록이 삭제되었거나 현재 가족 보드에서 확인할 수 없는 기록이에요."
          testID="timeline-detail-not-found"
        />
      )}
    </SpecShell>
  );
}

function AmbiguousGrowthRecordDetailContent({
  detail,
  onSelect,
}: {
  detail: Extract<RecordDetail, { kind: "AMBIGUOUS_GROWTH" }>;
  onSelect: (source: RecordDetailSource) => void;
}) {
  const logDate = formatRecordDetailDateTime(detail.logRecord.recordedAt);
  const logSummary = detail.logRecord.value.trim() || detail.logRecord.note?.trim() || "기록 내용 없음";
  const measurementDate = formatRecordDetailDateTime(detail.growthMeasurement.measuredAt);
  const measurementSummary = growthMeasurementSummary(detail.growthMeasurement);

  return (
    <View style={styles.recordDetailCard} testID="timeline-detail-growth-ambiguous">
      <View style={styles.recordDetailHeader}>
        <Text style={styles.recordDetailKind}>이전 성장 알림</Text>
        <Text style={styles.recordDetailTitle}>어떤 성장 기록인지 선택해 주세요</Text>
        <Text style={styles.ambiguousGrowthDescription}>
          이전 알림과 같은 번호의 기록이 두 곳에 있어 날짜와 내용을 확인한 뒤 선택해야 해요.
        </Text>
      </View>
      <GrowthRecordCandidate
        title="생활 성장 기록"
        date={logDate}
        summary={logSummary}
        testID="timeline-detail-growth-log-candidate"
        onPress={() => onSelect("LOG")}
      />
      <GrowthRecordCandidate
        title="신체 성장 측정"
        date={measurementDate}
        summary={measurementSummary}
        testID="timeline-detail-growth-measurement-candidate"
        onPress={() => onSelect("GROWTH_MEASUREMENT")}
      />
    </View>
  );
}

function GrowthRecordCandidate({
  title,
  date,
  summary,
  testID,
  onPress,
}: {
  title: string;
  date: string;
  summary: string;
  testID: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.ambiguousGrowthCandidate}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${date}. ${summary}`}
      accessibilityHint="선택한 성장 기록의 상세 내용을 엽니다."
      testID={testID}>
      <View style={styles.ambiguousGrowthCandidateCopy}>
        <Text style={styles.ambiguousGrowthCandidateTitle}>{title}</Text>
        <Text style={styles.ambiguousGrowthCandidateDate} testID={`${testID}-date`}>{date}</Text>
        <Text style={styles.ambiguousGrowthCandidateSummary} testID={`${testID}-summary`}>{summary}</Text>
      </View>
      <Text style={styles.ambiguousGrowthCandidateAction} accessibilityElementsHidden>
        상세 보기 ›
      </Text>
    </Pressable>
  );
}

function RecordDetailState({
  title,
  description,
  testID,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  testID: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.statsEmptyCard} testID={testID}>
      <Text style={styles.statsEmptyTitle}>{title}</Text>
      <Text style={styles.statsEmptyDescription}>{description}</Text>
      {actionLabel && onAction ? (
        <Pressable
          style={styles.outlineButton}
          onPress={onAction}
          accessibilityRole="button"
          testID={`${testID}-action`}>
          <Text style={styles.outlineButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type ConcreteRecordDetail = Exclude<RecordDetail, { kind: "AMBIGUOUS_GROWTH" }>;

function RecordDetailContent({
  detail,
  currentCaregiverId,
}: {
  detail: ConcreteRecordDetail;
  currentCaregiverId?: number;
}) {
  const fields = recordDetailFields(detail);

  return (
    <View style={styles.recordDetailCard} testID="timeline-detail-content">
      <View style={styles.recordDetailHeader}>
        <Text style={styles.recordDetailKind}>알림에서 선택한 기록</Text>
        <Text style={styles.recordDetailTitle}>{recordDetailTitle(detail)}</Text>
        <SafetyActions target={recordSafetyTarget(detail)} currentCaregiverId={currentCaregiverId} testID="record-detail-safety" label="신고·차단" />
      </View>
      {fields.map((field) => (
        <DetailLine key={field.label} label={field.label} value={field.value} muted={field.muted} />
      ))}
    </View>
  );
}

function recordSafetyTarget(detail: ConcreteRecordDetail): SafetyTarget {
  switch (detail.kind) {
    case "LOG": return { type: "LOG", id: detail.record.id, caregiverId: detail.record.caregiverId, displayName: detail.record.caregiverName };
    case "GROWTH": return { type: "GROWTH_MEASUREMENT", id: detail.record.id, caregiverId: detail.record.caregiverId, displayName: detail.record.caregiverName };
    case "VACCINATION": return { type: "VACCINATION_RECORD", id: detail.record.id, caregiverId: detail.record.createdById };
    case "HOSPITAL": return { type: "HOSPITAL_VISIT", id: detail.record.id, caregiverId: detail.record.createdById };
  }
}

function recordDetailFields(detail: ConcreteRecordDetail): Array<{ label: string; value: string; muted?: boolean }> {
  switch (detail.kind) {
    case "LOG": {
      const { record } = detail;
      return [
        { label: "기록 종류", value: logTypeLabel[detail.recordType] },
        { label: "기록 시간", value: formatRecordDetailDateTime(record.recordedAt) },
        ...(record.recordedEndAt
          ? [{ label: "종료 시간", value: formatRecordDetailDateTime(record.recordedEndAt) }]
          : []),
        detailField("기록 내용", record.value),
        detailField("세부 유형", record.recordSubtype),
        ...recordDetailMetadataFields(detail.recordType, record.details),
        detailField("기록한 보호자", record.caregiverName),
        detailField("메모", record.note),
      ];
    }
    case "GROWTH": {
      const { record } = detail;
      return [
        { label: "측정 일시", value: formatRecordDetailDateTime(record.measuredAt) },
        detailMeasurementField("키", record.heightCm, "cm"),
        detailMeasurementField("몸무게", record.weightKg, "kg"),
        detailMeasurementField("머리둘레", record.headCircumferenceCm, "cm"),
        detailField("기록한 보호자", record.caregiverName),
        detailField("메모", record.note),
      ];
    }
    case "VACCINATION": {
      const { record } = detail;
      return [
        detailField("백신명", record.name),
        detailField("접종 차수", record.doseLabel),
        { label: "상태", value: vaccinationStatusLabel(record.status) },
        { label: "예정 일시", value: formatRecordDetailDateTime(record.dueAt) },
        detailField("완료 일시", record.completedAt ? formatRecordDetailDateTime(record.completedAt) : null),
        detailField("메모", record.note),
      ];
    }
    case "HOSPITAL": {
      const { record } = detail;
      return [
        detailField("병원명", record.hospitalName),
        { label: "방문 일시", value: formatRecordDetailDateTime(record.visitedAt) },
        detailField("방문 사유", record.reason),
        detailField("진단/처방", record.diagnosis),
        detailField("메모", record.note),
      ];
    }
  }
}

function recordDetailMetadataFields(recordType: LogType, details: Record<string, unknown> | undefined) {
  if (recordType !== "DIAPER") {
    return [];
  }

  const color = typeof details?.color === "string" ? details.color.trim() : "";
  return color ? [{ label: "색상", value: color }] : [];
}

function detailField(label: string, value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? { label, value: normalized } : { label, value: "입력 없음", muted: true };
}

function detailMeasurementField(label: string, value: number | null, unit: string) {
  return value == null
    ? { label, value: "입력 없음", muted: true }
    : { label, value: `${formatMeasurementNumber(value)} ${unit}` };
}

function growthMeasurementSummary(record: GrowthMeasurementCard) {
  const measurements = [
    record.heightCm == null ? null : `키 ${formatMeasurementNumber(record.heightCm)} cm`,
    record.weightKg == null ? null : `몸무게 ${formatMeasurementNumber(record.weightKg)} kg`,
    record.headCircumferenceCm == null
      ? null
      : `머리둘레 ${formatMeasurementNumber(record.headCircumferenceCm)} cm`,
  ].filter((value): value is string => Boolean(value));

  return measurements.join(" · ") || record.note?.trim() || "측정값 없음";
}

function recordDetailTitle(detail: ConcreteRecordDetail) {
  switch (detail.kind) {
    case "LOG":
      return `${logTypeLabel[detail.recordType]} 기록`;
    case "GROWTH":
      return "성장 기록";
    case "VACCINATION":
      return "예방접종 기록";
    case "HOSPITAL":
      return "병원 방문 기록";
  }
}

function formatRecordDetailDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "날짜 정보 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function parseRecordDetailType(value: string | string[] | undefined): RecordDetailType | null {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = rawValue?.trim().toUpperCase();
  return normalized && recordDetailTypes.includes(normalized as RecordDetailType)
    ? (normalized as RecordDetailType)
    : null;
}

function parseRecordDetailSource(value: string | string[] | undefined): RecordDetailSource | null {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = rawValue?.trim().toUpperCase();
  return normalized === "LOG" || normalized === "GROWTH_MEASUREMENT" ? normalized : null;
}

function parsePositiveRecordId(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue || !/^\d+$/.test(rawValue.trim())) {
    return null;
  }

  const recordId = Number(rawValue);
  return Number.isSafeInteger(recordId) && recordId > 0 ? recordId : null;
}

function recordDetailBackRoute(
  recordType: RecordDetailType | null,
  recordSource: RecordDetailSource | null,
  detail: RecordDetail | null,
) {
  if (detail?.kind === "AMBIGUOUS_GROWTH") {
    return "/notifications" as const;
  }

  switch (recordType) {
    case "GROWTH":
      return recordSource === "LOG" || detail?.kind === "LOG" ? "/timeline" as const : "/growth" as const;
    case "VACCINATION":
      return "/vaccinations" as const;
    case "HOSPITAL":
      return "/hospital-visits" as const;
    default:
      return "/timeline" as const;
  }
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
          setLoadMessage(null);
          showAppAlert(error instanceof Error ? error.message : "통계 데이터를 불러오지 못했어요.");
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
      <RecordAgeGuidance category="GROWTH" />
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
  const app = useBabyBossAppContext();
  const safety = useContentSafetyState();
  const back = useFallbackBack("/growth");
  const [allMeasurements, setMeasurements] = useState<GrowthMeasurementCard[]>([]);
  const measurements = safety.status === "ready" ? allMeasurements.filter((entry) => !isSafetyTargetHidden(safety, "GROWTH_MEASUREMENT", entry.id)) : [];
  const [isLoading, setIsLoading] = useState(false);
  const latest = measurements[0] ?? null;

  useEffect(() => {
    let isActive = true;

    async function loadMeasurements() {
      if (safety.status !== "ready") return;
      setIsLoading(true);
      try {
        const session = await restoreSession();
        const rows = await fetchGrowthMeasurements(session.family.id);

        if (isActive) {
          setMeasurements(rows);
        }
      } catch (error) {
        if (isActive) {
          setMeasurements([]);
          showAppAlert(error instanceof Error ? error.message : "성장 기록을 불러오지 못했어요.");
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
  }, [safety, app.session?.caregiver.id]);

  return (
    <SpecShell testID="screen-growth-detail">
      {safety.status !== "ready" ? <SafetyStateNotice state={safety} /> : null}
      <MetricHeader
        title="최근 성장 기록"
        value={formatGrowthDetailMetric(latest)}
        meta={isLoading ? "불러오는 중..." : latest ? `최근 ${formatGrowthDetailDate(latest.measuredAt)}` : "기록 없음"}
      />
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
          <ListRow key={measurement.id} title={formatGrowthDetailDate(measurement.measuredAt)} subtitle={formatGrowthDetailRecord(measurement)} action={<SafetyActions target={{ type: "GROWTH_MEASUREMENT", id: measurement.id, caregiverId: measurement.caregiverId, displayName: measurement.caregiverName }} currentCaregiverId={app.session?.caregiver.id} testID={`growth-safety-${measurement.id}`} />} />
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
      showAppAlert("기록 리마인더를 불러온 뒤 저장할 수 있어요.");
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

export function PrivacyRoute() {
  const back = useFallbackBack("/settings");
  const router = useRouter();
  const app = useBabyBossAppContext();
  const loggingOut = app.busyAction === "logout";

  async function handleLogout() {
    await app.handleLogout();
    router.replace("/login");
  }

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
      <ListRow
        title="계정 탈퇴"
        subtitle="개인 탈퇴 또는 가족 전체 삭제를 관리합니다."
        icon="data-security"
        onPress={() => router.push("/account-deletion")}
      />
      <OutlineButton
        label={loggingOut ? "로그아웃 중..." : "로그아웃"}
        danger
        disabled={loggingOut}
        onPress={() => void handleLogout()}
        testID="privacy-logout"
      />
    </SpecShell>
  );
}

export function AccountDeletionRoute() {
  const back = useFallbackBack("/privacy");
  const router = useRouter();
  const app = useBabyBossAppContext();
  const [deletionSession, setDeletionSession] = useState<SessionResponse | null>(null);
  const [caregivers, setCaregivers] = useState<CaregiverSummary[]>([]);
  const family = deletionSession?.family ?? null;
  const caregiver = deletionSession?.caregiver ?? null;
  const [authMethods, setAuthMethods] = useState<AccountDeletionAuthMethods | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [captchaBusy, setCaptchaBusy] = useState(false);
  const captchaRef = useRef<AuthCaptchaHandle>(null);
  const canLeave = canLeaveFamily(caregivers);
  const isOwner = isFamilyDeletionOwner(family, caregiver?.id);
  const scheduledFor = formatFamilyDeletionDate(family?.deletionScheduledFor);
  const requiresNativeOAuthReauthentication = Platform.OS === "web"
    && Boolean(authMethods)
    && !authMethods?.emailPassword
    && Boolean(authMethods?.google || authMethods?.apple);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setDeletionSession(null);
      setCaregivers([]);
      setAuthMethods(null);

      void (async () => {
        try {
          const context = await loadAccountDeletionScreenContext();
          if (active) {
            setDeletionSession(context.session);
            setCaregivers(context.caregivers);
            setAuthMethods(context.authMethods);
          }
        } catch (error) {
          if (active) {
            showAppAlert(error instanceof Error ? error.message : "계정 본인 확인 방식을 불러오지 못했어요.");
          }
        }
      })();

      return () => {
        active = false;
      };
    }, []),
  );

  async function runDeletion(mode: "LEAVE_FAMILY" | "DELETE_FAMILY") {
    if (!caregiver || !family) {
      showAppAlert("계정 정보를 불러오지 못했어요. 다시 로그인해 주세요.");
      return;
    }

    const submit = async (captchaToken?: string) => {
      const result = await requestAccountDeletion({ mode, password: password || undefined, captchaToken });

      if (result.mode === "LEAVE_FAMILY") {
        await app.handleLogout();
        router.replace("/login");
        if (result.appleAccessRevocationStatus === "MANUAL_REQUIRED") {
          showAppleManualRevocationAction(
            "탈퇴 요청을 접수했어요",
            "앱 접근을 차단하고 내가 작성하거나 업로드한 콘텐츠와 계정을 삭제하고 있어요. Apple 계정에 남아 있는 아이로그 로그인 연결은 직접 해제해 주세요.",
          );
        } else if (result.appleAccessRevocationStatus === "AUTOMATIC") {
          showAppAlert(
            "앱 접근을 차단하고 내가 작성하거나 업로드한 콘텐츠와 계정을 삭제하고 있어요. Apple 로그인 연결도 서버에서 자동으로 해제 처리됩니다.",
            "탈퇴 요청을 접수했어요",
          );
        } else {
          showAppAlert(
            "앱 접근을 차단하고 내가 작성하거나 업로드한 기록, 사진, 대화와 댓글을 삭제하고 있어요. 가족 공간과 다른 구성원의 콘텐츠는 유지됩니다.",
            "탈퇴 요청을 접수했어요",
          );
        }
        return;
      }

      await app.refreshAll();
      setDeletionSession((current) => current ? {
        ...current,
        family: { ...current.family, deletionScheduledFor: result.scheduledFor },
      } : current);
      setPassword("");
      const deletionDate = formatFamilyDeletionDate(result.scheduledFor) ?? "30일 후";
      if (result.appleAccessRevocationStatus === "MANUAL_REQUIRED") {
        showAppleManualRevocationAction(
          "가족 전체 삭제를 예약했어요",
          `${deletionDate}에 가족 전체 데이터가 영구 삭제됩니다. 가족 구성원 중 자동 해지 준비가 안 된 Apple 계정이 있어요. 해당 구성원은 삭제 전에 Apple 계정 설정에서 아이로그 연결을 직접 해제해 주세요.`,
        );
      } else if (result.appleAccessRevocationStatus === "AUTOMATIC") {
        showAppAlert(
          `${deletionDate}에 가족 전체 데이터가 영구 삭제됩니다. Apple 로그인 연결도 실제 삭제 직후 서버에서 자동으로 해제됩니다.`,
          "가족 전체 삭제를 예약했어요",
        );
      } else {
        showAppAlert(
          `${deletionDate}에 가족 전체 데이터가 영구 삭제됩니다. 그 전까지 이 화면에서 취소할 수 있어요.`,
          "가족 전체 삭제를 예약했어요",
        );
      }
    };

    try {
      setBusy(true);

      if (authMethods?.emailPassword) {
        if (!password) {
          showAppAlert("계정을 삭제하려면 현재 비밀번호를 입력해 주세요.");
          return;
        }

        setCaptchaBusy(true);
        await runAuthCaptcha(captchaRef, submit);
        return;
      }

      if (authMethods?.google || authMethods?.apple) {
        await submit();
        return;
      }

      showAppAlert("이 계정의 본인 확인 방식을 찾지 못했어요. 고객지원으로 문의해 주세요.");
    } catch (error) {
      if (!isAuthCaptchaCancelled(error)) {
        showAppAlert(error instanceof Error ? error.message : "계정 삭제 요청을 처리하지 못했어요.");
      }
    } finally {
      setBusy(false);
      setCaptchaBusy(false);
    }
  }

  function confirmDeletion(mode: "LEAVE_FAMILY" | "DELETE_FAMILY") {
    const isFamilyDeletion = mode === "DELETE_FAMILY";
    const title = isFamilyDeletion ? "가족 전체를 삭제할까요?" : "개인 계정을 탈퇴할까요?";
    const message = isFamilyDeletion
      ? "30일 뒤 가족의 아이 정보, 기록, 사진, 채팅과 모든 가족 계정이 영구 삭제됩니다. 30일 안에는 예약을 취소할 수 있어요."
      : "내 계정과 개인 정보가 삭제되고, 내가 작성하거나 업로드한 기록, 사진, 대화와 댓글도 삭제 또는 비가역적으로 가림 처리됩니다. 가족 공간과 다른 구성원의 콘텐츠는 유지됩니다.";

    if (requiresNativeOAuthReauthentication) {
      if (typeof window !== "undefined" && window.confirm(
        "웹에서는 Google 또는 Apple 계정 본인 확인을 완료할 수 없어요. iOS 또는 Android 앱에서 다시 시도해 주세요. 앱에 로그인할 수 없다면 확인을 눌러 삭제 요청 메일을 보내 주세요.",
      )) {
        void openSupportEmail("아이로그 OAuth 계정 삭제 요청");
      }
      return;
    }

    confirmAccountDeletionAction({
      title,
      message,
      confirmLabel: isFamilyDeletion ? "30일 후 삭제 예약" : "탈퇴하기",
      onConfirm: () => void runDeletion(mode),
    });
  }

  async function cancelDeletion() {
    try {
      setBusy(true);
      await cancelFamilyDeletion();
      await app.refreshAll();
      setDeletionSession((current) => current ? {
        ...current,
        family: { ...current.family, deletionScheduledFor: null },
      } : current);
      showAppAlert("가족 전체 삭제 예약을 취소했어요.", "삭제 예약을 취소했어요");
    } catch (error) {
      showAppAlert(error instanceof Error ? error.message : "가족 전체 삭제 예약을 취소하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SpecShell testID="screen-account-deletion">
      <Header title="계정 탈퇴" onBack={back} />
      <Text style={styles.sectionLabel}>개인 탈퇴</Text>
      <Text style={styles.personalInfoHint}>
        내 계정, 프로필, 연락처와 푸시 알림 정보가 삭제됩니다. 내가 작성하거나 업로드한 기록, 사진, 대화와 댓글도 삭제하거나, 다른 구성원의 답글 보존에 필요한 경우 내용을 복원할 수 없게 가립니다. 가족 공간과 다른 구성원의 콘텐츠는 유지됩니다.
      </Text>
      {authMethods?.apple ? (
        <Text style={styles.footerNote}>
          Apple로 가입한 계정은 실제 탈퇴 완료 시 아이로그 로그인 연결도 서버에서 자동으로 해제합니다. 가족 삭제는 Apple 계정을 사용하는 모든 구성원의 자동 해지 준비가 확인된 경우에만 전체 자동 처리로 안내합니다.
        </Text>
      ) : null}
      {canLeave ? (
        <>
          {authMethods?.emailPassword ? (
            <Field label="현재 비밀번호">
              <InputBox
                value={password}
                placeholder="현재 비밀번호를 입력하세요"
                secureTextEntry
                autoCapitalize="none"
                onChangeText={setPassword}
                testID="account-deletion-password-input"
              />
            </Field>
          ) : null}
          <OutlineButton
            label={busy || captchaBusy
              ? "본인 확인 중..."
              : requiresNativeOAuthReauthentication
                ? "앱에서 본인 확인 후 개인 계정 탈퇴"
              : authMethods?.emailPassword
                ? "비밀번호 확인 후 개인 계정 탈퇴"
                : authMethods?.google
                  ? "Google로 본인 확인 후 탈퇴"
                  : authMethods?.apple
                    ? "Apple로 본인 확인 후 탈퇴"
                    : "개인 계정 탈퇴"}
            danger
            disabled={busy || captchaBusy || !authMethods}
            onPress={() => confirmDeletion("LEAVE_FAMILY")}
            testID="account-deletion-leave-family"
          />
        </>
      ) : (
        <Text style={styles.footerNote}>현재 가족 공간에 혼자 계세요. 아래 가족 전체 삭제를 이용해 주세요.</Text>
      )}

      <Text style={styles.sectionLabel}>가족 전체 삭제</Text>
      <Text style={styles.personalInfoHint}>
        가족 전체 삭제는 대표 보호자만 요청할 수 있어요. 요청 후 30일 동안은 가족 관리와 기록을 계속 사용할 수 있고, 이 화면에서 예약을 취소할 수 있습니다.
      </Text>
      {scheduledFor ? (
        <View style={styles.readOnlyValue}>
          <Text style={styles.readOnlyValueText}>{scheduledFor}에 가족 전체 데이터가 삭제됩니다.</Text>
        </View>
      ) : null}
      {isOwner ? (
        scheduledFor ? (
          <OutlineButton
            label={busy ? "취소 중..." : "가족 전체 삭제 예약 취소"}
            disabled={busy}
            onPress={() => void cancelDeletion()}
            testID="account-deletion-cancel-family"
          />
        ) : (
          <PrimaryButton
            label={busy || captchaBusy
              ? "본인 확인 중..."
              : requiresNativeOAuthReauthentication
                ? "앱에서 본인 확인 후 가족 전체 삭제 예약"
              : authMethods?.emailPassword
                ? "비밀번호 확인 후 가족 전체 삭제 예약"
                : authMethods?.google
                  ? "Google로 본인 확인 후 삭제 예약"
                  : authMethods?.apple
                    ? "Apple로 본인 확인 후 삭제 예약"
                    : "가족 전체 삭제 예약"}
            disabled={busy || captchaBusy || !authMethods}
            onPress={() => confirmDeletion("DELETE_FAMILY")}
            testID="account-deletion-schedule-family"
          />
        )
      ) : (
        <Text style={styles.footerNote}>가족 전체 삭제는 가족 대표 보호자만 요청할 수 있어요.</Text>
      )}
      <AuthCaptcha ref={captchaRef} />
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
  const [captchaBusy, setCaptchaBusy] = useState(false);
  const captchaRef = useRef<AuthCaptchaHandle>(null);

  useEffect(() => {
    setName(caregiver?.name ?? roleDefaultNickname.GUARDIAN);
    setRole(caregiver?.role ?? "GUARDIAN");
    setContactPhone(caregiver?.contactPhone ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setPasswordConfirmation("");
  }, [caregiver?.id, caregiver?.name, caregiver?.role, caregiver?.contactPhone]);

  const passwordChangeRequested = Boolean(currentPassword || newPassword || passwordConfirmation);

  async function save() {
    if (!caregiver) {
      showAppAlert("프로필 정보를 불러오지 못했어요.");
      return;
    }

    if (!name.trim()) {
      showAppAlert("닉네임을 입력해 주세요.");
      return;
    }

    if (passwordChangeRequested) {
      if (!currentPassword || !newPassword || !passwordConfirmation) {
        showAppAlert("비밀번호를 바꾸려면 모든 비밀번호 항목을 입력해 주세요.");
        return;
      }

      if (newPassword !== passwordConfirmation) {
        showAppAlert("새 비밀번호가 일치하지 않아요.");
        return;
      }

      if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
        showAppAlert("새 비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.");
        return;
      }
    }

    const persist = (captchaToken?: string) =>
      action.run((session) =>
        updateCaregiverPersonalInfo(session.caregiver.id, {
        name,
        role,
        contactPhone,
        currentPassword: passwordChangeRequested ? currentPassword : undefined,
        newPassword: passwordChangeRequested ? newPassword : undefined,
          captchaToken,
        }),
      );

    if (!passwordChangeRequested) {
      await persist();
      return;
    }

    try {
      setCaptchaBusy(true);
      await runAuthCaptcha(captchaRef, persist);
    } catch (error) {
      if (!isAuthCaptchaCancelled(error)) {
        showAppAlert(error instanceof Error ? error.message : "보안 확인을 완료하지 못했어요.");
      }
    } finally {
      setCaptchaBusy(false);
    }
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
      <PrimaryButton
        label={action.busy || captchaBusy ? "확인 중..." : "저장"}
        onPress={() => void save()}
        disabled={action.busy || captchaBusy || !caregiver}
        testID="personal-info-save"
      />
      <ActionStatus message={action.message} />
      <AuthCaptcha ref={captchaRef} />
    </SpecShell>
  );
}

const appInfoRows = [
  { label: "앱 이름", value: "아이로그" },
  { label: "버전", value: "1.0.0" },
  { label: "앱 ID", value: "com.ilog.mobile" },
  { label: "지원 기기", value: "iPhone·Android 스마트폰 (iPad는 추후 지원)" },
  { label: "운영 주체", value: operatorDisplayName },
  { label: "사업자등록번호", value: operatorBusinessRegistrationNumber },
  { label: "고객지원 이메일", value: supportEmail },
  { label: "개인정보 보호책임자", value: `${operatorRepresentative} (${supportEmail})` },
];

type LegalSection = {
  title: string;
  body: string[];
};

const termsSections: LegalSection[] = [
  {
    title: "제1조 목적과 적용",
    body: [
      `이 약관은 ${operatorDisplayName}(이하 "운영자")가 제공하는 아이로그 앱과 관련 서비스의 이용 조건 및 운영자와 회원의 권리와 책임을 정합니다.`,
      "회원이 가입을 완료하거나 서비스를 계속 이용하면 이 약관에 동의한 것으로 봅니다.",
    ],
  },
  {
    title: "제2조 서비스 내용",
    body: [
      "아이로그는 가족 구성원이 아이의 맘마, 수면, 기저귀, 체온, 성장, 병원 방문, 예방접종, 사진, 메모와 대화를 함께 기록하고 확인하도록 돕습니다.",
      "기록, 통계와 육아 정보는 일상적인 관리에 참고하기 위한 것이며 의료 진단, 처방 또는 전문가의 판단을 대신하지 않습니다. 건강 이상이 의심되면 의료기관이나 전문가에게 확인해야 합니다.",
    ],
  },
  {
    title: "제3조 가입과 계정 관리",
    body: [
      "회원은 본인이 사용할 수 있는 이메일, Apple 또는 Google 계정으로 가입하고 정확한 정보를 제공해야 합니다.",
      "계정과 인증 수단을 안전하게 관리할 책임은 회원에게 있으며, 무단 사용이 의심되면 즉시 비밀번호를 변경하고 고객지원에 알려야 합니다.",
      "만 14세 미만 아동의 정보를 등록하는 회원은 해당 정보를 관리할 권한과 보호자 동의를 확보해야 합니다.",
    ],
  },
  {
    title: "제4조 가족 공간과 공유",
    body: [
      "초대 링크 또는 초대 코드로 같은 가족 공간에 참여한 회원은 해당 공간에 등록된 아이 정보, 기록, 사진과 가족 대화를 함께 열람할 수 있습니다.",
      `회원은 신뢰할 수 있는 사람에게만 초대 정보를 전달해야 하며, 잘못 초대한 경우 ${supportEmail}로 권한 정리를 요청할 수 있습니다. 사용자 차단은 가족 접근 권한을 제거하는 기능이 아닙니다.`,
      "회원이 가족 공간에 등록한 내용은 해당 가족 구성원에게 공유되는 것에 동의한 것으로 봅니다.",
    ],
  },
  {
    title: "제5조 회원 콘텐츠",
    body: [
      "회원은 본인이 등록한 기록, 사진, 메모와 메시지에 필요한 권리를 보유해야 하며 타인의 개인정보나 저작권을 침해해서는 안 됩니다.",
      "운영자는 법령 위반, 권리 침해, 서비스 장애 또는 안전 문제를 일으키는 콘텐츠를 제한하거나 삭제할 수 있습니다.",
      "회원은 대화, 댓글, 사진, 기록 또는 가족 구성원의 신고·차단 메뉴에서 콘텐츠나 사용자를 신고할 수 있습니다. 신고는 운영자가 확인하며, 접수한 콘텐츠는 신고자 화면에서 숨겨집니다. 신고와 사용자 차단은 별도 기능입니다.",
      "사용자를 차단하면 보호자 간 대화·댓글·태그·개인 알림 접촉이 제한됩니다. 차단은 가족에서 강퇴하거나 공동 육아 기록·일정·분담·가족 사진을 삭제하는 기능이 아니며, 가족 권한과 공동 기록 공유는 유지됩니다. 차단 해제는 설정의 신고·차단 관리에서 할 수 있습니다.",
    ],
  },
  {
    title: "제6조 금지 행위",
    body: [
      "타인의 계정이나 가족 초대 정보를 무단 사용하거나, 서비스의 보안과 정상 운영을 방해하거나, 불법 정보와 악성 코드를 등록해서는 안 됩니다.",
      "아동 성적 착취·학대, 음란물, 폭력·협박·괴롭힘·혐오, 타인의 개인정보 침해와 스팸 콘텐츠를 게시해서는 안 됩니다. 일부 부적절한 표현은 게시 전에 제한되며, 신고 접수 후 검토 결과에 따라 콘텐츠를 숨기거나 작성자를 제한할 수 있습니다.",
      "운영자는 위반 행위의 정도에 따라 콘텐츠 제한, 이용 정지 또는 계정 해지 조치를 할 수 있습니다.",
    ],
  },
  {
    title: "제7조 알림과 외부 서비스",
    body: [
      "푸시 알림과 이메일은 기기 설정, 네트워크, 운영체제와 외부 전송 서비스 상태에 따라 지연되거나 전달되지 않을 수 있습니다.",
      "인증, 데이터 저장, 알림과 이메일 제공을 위해 제3자 서비스를 사용할 수 있으며 관련 개인정보 처리는 개인정보 처리방침에 따릅니다.",
    ],
  },
  {
    title: "제8조 서비스 변경과 중단",
    body: [
      "운영자는 품질 개선, 보안, 점검, 법령 또는 외부 서비스 변경으로 서비스의 전부나 일부를 변경하거나 일시 중단할 수 있습니다.",
      "예측 가능한 중대한 변경이나 중단은 앱 내 공지 등 합리적인 방법으로 사전에 안내합니다. 긴급 장애나 보안 대응은 사후 안내할 수 있습니다.",
    ],
  },
  {
    title: "제9조 탈퇴와 데이터 삭제",
    body: [
      `회원은 개인정보 설정에서 개인 탈퇴 또는 가족 전체 삭제를 요청하거나 ${supportEmail}로 요청할 수 있습니다.`,
      "개인 탈퇴 시 계정, 프로필, 연락처와 푸시 알림 정보를 삭제하고, 본인이 작성하거나 업로드한 기록, 사진, 대화와 댓글도 삭제합니다. 다른 구성원의 답글이나 연결 관계를 보존해야 하는 대화와 댓글은 작성자와 내용을 식별하거나 복원할 수 없게 가림 처리할 수 있습니다. 가족 공간과 다른 구성원이 작성한 콘텐츠는 유지됩니다.",
      "가족 전체 삭제는 대표 보호자가 요청할 수 있으며, 요청일로부터 30일 뒤 가족의 아이 정보, 기록, 사진, 대화와 가족 계정을 영구 삭제합니다. 요청 후 30일 안에는 앱에서 삭제 예약을 취소할 수 있습니다.",
    ],
  },
  {
    title: "제10조 책임의 범위",
    body: [
      "운영자는 고의 또는 중대한 과실이 없는 한 회원의 입력 오류, 기기나 네트워크 문제, 외부 서비스 장애로 발생한 손해에 책임을 지지 않습니다.",
      "운영자는 서비스 안정성과 데이터 보호를 위해 합리적인 조치를 수행하며, 관련 법령에 따라 책임져야 하는 사항은 이 조항으로 제한되지 않습니다.",
    ],
  },
  {
    title: "제11조 약관 변경과 문의",
    body: [
      "약관이 변경되면 시행일과 주요 내용을 앱 내 공지 등으로 안내합니다. 회원에게 불리한 중대한 변경은 합리적인 사전 안내 기간을 둡니다.",
      `서비스 이용 문의는 고객지원 이메일 ${supportEmail}로 접수할 수 있습니다.`,
      "이 약관은 대한민국 법령을 따르며, 분쟁은 관련 법령이 정한 절차와 관할에 따라 해결합니다.",
      `시행일: ${termsEffectiveDate} (문서 버전: ${legalDocumentVersions.terms})`,
    ],
  },
];

const privacyPolicySections: LegalSection[] = [
  {
    title: "1. 개인정보 처리자와 문의처",
    body: [
      `${operatorDisplayName}은(는) 아이로그 서비스 제공을 위해 개인정보를 처리합니다.`,
      `사업자등록번호는 ${operatorBusinessRegistrationNumber}입니다.`,
      `개인정보 보호책임자는 ${operatorRepresentative}이며, 고객지원과 개인정보 관련 요청은 ${supportEmail}로 접수합니다.`,
      "열람, 수정, 삭제, 처리 정지 요청 시 가입한 이메일 주소와 요청 내용을 알려 주세요. 본인 확인 후 관련 법령에 따라 처리합니다.",
    ],
  },
  {
    title: "2. 처리 목적",
    body: [
      "회원 가입, 로그인, 가족 공간 생성 및 초대, 아이 정보 관리, 육아 기록 저장, 통계 제공, 댓글 및 알림 제공을 위해 개인정보를 처리합니다.",
      "문의 대응, 서비스 안정성 확인, 부정 이용 방지 등 서비스 운영에 필요한 범위에서도 정보를 사용할 수 있습니다.",
      "콘텐츠·사용자 신고 검토, 아동 안전 및 권리 보호, 보호자 간 접촉 차단을 위해 필요한 최소 정보를 처리합니다.",
    ],
  },
  {
    title: "3. 처리하는 정보",
    body: [
      "보호자 정보: 이메일, 닉네임, 역할, 연락처, 프로필 이미지, 로그인 식별자와 가족 초대 정보",
      "아이 정보: 이름, 생년월일, 성별, 몸무게와 프로필 이미지",
      "서비스 이용 정보: 맘마, 수면, 기저귀, 체온, 약/영양제, 유축, 성장, 예방접종, 병원 방문, 메모, 분담, 채팅과 사진 정보",
      "기기 및 운영 정보: 푸시 토큰, 알림 설정, 앱 버전, 기기·운영체제 정보, 접속 시각, 오류 및 보안 로그",
      "신고·차단 정보: 신고자·대상 보호자의 내부 식별자, 대상 콘텐츠 종류와 식별자, 신고 사유, 선택 입력한 설명, 처리 상태·시각, 운영 조치와 차단 관계. 신고를 위해 사진이나 본문 원문을 별도로 복제하여 전송하지 않습니다. 설명에는 아이 이름·연락처·주소·건강 정보 등 민감한 개인정보를 입력하지 마세요.",
      "비밀번호 원문은 저장하지 않으며 인증 서비스에서 암호화된 인증 정보로 관리합니다.",
    ],
  },
  {
    title: "4. 수집 방법",
    body: [
      "회원이 가입, 프로필 설정, 기록 작성, 사진 업로드, 가족 초대와 채팅 과정에서 직접 정보를 제공합니다.",
      "로그인, 알림 수신과 앱 사용 과정에서 필요한 기기 및 운영 정보가 자동으로 생성될 수 있습니다.",
    ],
  },
  {
    title: "5. 보유 및 이용 기간",
    body: [
      "회원과 가족 공간이 유지되는 동안 서비스 제공을 위해 정보를 보관합니다.",
      "개인 탈퇴 시 서비스 접근을 즉시 차단하고 계정, 프로필, 연락처, 푸시 알림 정보와 본인이 작성하거나 업로드한 기록, 사진, 대화와 댓글을 삭제합니다. 다른 구성원의 답글이나 연결 관계를 보존해야 하는 대화와 댓글은 작성자와 내용을 식별하거나 복원할 수 없게 가림 처리할 수 있습니다. 저장소 파일 삭제가 일시적으로 실패하면 자동 재시도하며, 예외적으로 수동 조치가 필요한 경우 3영업일 이내 완료합니다.",
      "가족 전체 삭제 요청은 30일의 취소 가능 기간을 거친 뒤 가족의 아이 정보, 기록, 사진, 대화와 가족 계정을 영구 삭제합니다. 법령에 따른 별도 보관 의무가 있는 정보는 해당 의무가 끝난 뒤 삭제합니다.",
      "법령에 따라 별도 보관이 필요한 경우 해당 목적과 기간 동안 분리해 보관하고 기간 종료 후 삭제합니다.",
      "신고 정보는 해결 또는 종결 처리 후 90일 이내 삭제합니다. 처리 중에는 안전 검토를 위해 보관하며, 차단 관계는 차단 해제 또는 관련 계정 삭제 시 삭제합니다.",
    ],
  },
  {
    title: "6. 가족 구성원 간 공유",
    body: [
      "같은 가족 공간에 참여한 구성원은 아이 정보, 육아 기록, 사진, 분담과 가족 대화를 함께 열람할 수 있습니다.",
      "아이로그는 법령상 근거 또는 회원 동의가 있는 경우를 제외하고 개인정보를 제3자에게 판매하거나 가족 공간 외부에 제공하지 않습니다.",
      "신고 내용과 처리 정보는 권한을 부여받은 운영자만 확인할 수 있으며 다른 가족 구성원에게 공개하지 않습니다. 차단해도 공동 육아 기록과 가족 접근 권한은 유지되며, 대화·댓글 등 접촉 범위만 제한됩니다.",
    ],
  },
  {
    title: "7. 개인정보 처리위탁 및 국외 처리",
    body: [
      "아이로그는 서비스 제공과 보안에 필요한 범위에서 아래 사업자에게 개인정보 처리 업무를 위탁합니다. 보호자와 아이의 정보를 광고 또는 판매 목적으로 제3자에게 제공하지 않습니다.",
      "Supabase, Inc.(미국): 회원 인증, 데이터베이스, 사진·파일 저장과 서버 기능을 제공합니다. 처리 항목은 계정·프로필·가족·아이·기록·사진·대화·알림 설정·푸시 토큰이며, 현재 서비스 데이터베이스와 저장소는 대한민국 서울 리전에 보관됩니다. 서비스 이용 기간 및 계정·가족 삭제 정책에 따른 기간 동안 처리됩니다.",
      "Apple Inc. 및 Google LLC(미국 등): 이용자가 Apple 또는 Google 로그인을 선택한 경우에만 인증 제공자가 전달하는 식별자, 이메일과 프로필 정보를 로그인 확인에 사용합니다. 해당 정보는 암호화된 인증 통신으로 각 제공자의 인증 인프라가 위치한 국가에 전송될 수 있으며, 인증 처리 완료 및 제공업체 정책상 필요한 기간 동안 처리됩니다.",
      "Expo(650 Industries, Inc.), Apple Push Notification service 및 Firebase Cloud Messaging(미국 등): 기기 푸시 토큰, 알림 제목·본문, 앱 내 이동 정보가 알림을 요청할 때 전송됩니다. 암호화된 통신으로 각 제공자의 메시지 전달 인프라가 위치한 국가에서 처리되며, 알림 전달 및 제공업체 정책상 필요한 기간 동안 보관됩니다.",
      "hCaptcha(미국 등): 회원가입, 로그인, 비밀번호 재설정과 계정 정보 변경·삭제 요청에서 자동화된 부정 사용을 막기 위해 보안 검증 토큰, IP 주소와 요청 보안 정보를 처리합니다. 해당 정보는 암호화된 통신으로 hCaptcha 서비스 인프라가 위치한 국가에 전송될 수 있고, 제공업체 정책상 필요한 기간 동안 처리됩니다.",
      "Resend, Inc.(미국): 가입 확인과 비밀번호 재설정 등 서비스성 이메일 발송을 위해 수신 이메일 주소, 메일 제목·본문 및 인증 링크를 처리합니다. 현재 Resend Tokyo(ap-northeast-1) 리전을 사용하며, 발송 요청 시 암호화된 통신으로 전송되고 이메일 발송 및 제공업체 정책상 필요한 기간 동안 처리됩니다.",
      "국외 처리 항목은 서비스 제공을 위해 필요한 시점에만 전송됩니다. 이용자는 개인정보 처리방침에 따른 처리에 동의하지 않을 수 있으나, 해당 기능 이용이 제한될 수 있습니다. 새로운 국외 처리 또는 처리 방식 변경으로 별도 고지나 동의가 필요한 경우 적용 전에 안내합니다.",
    ],
  },
  {
    title: "8. 회원의 권리",
    body: [
      "회원은 앱의 개인정보 설정에서 본인 정보를 확인하고 수정할 수 있으며, 개인 탈퇴 또는 가족 전체 삭제를 요청할 수 있습니다.",
      `앱에서 직접 처리하기 어려운 요청은 ${supportEmail}로 접수할 수 있으며, 본인 확인 후 관련 법령에 따라 처리합니다.`,
      "아이 정보와 가족 공동 기록은 요청자의 권한, 다른 가족 구성원의 권리와 법적 보관 필요성을 확인한 뒤 처리할 수 있습니다.",
    ],
  },
  {
    title: "9. 안전성 확보 조치",
    body: [
      "인증 세션, 데이터베이스 행 단위 접근 정책과 파일 저장소 접근 제어를 사용해 가족 단위로 접근을 제한합니다.",
      "전송 구간 암호화, 비밀키 분리 보관, 최소 권한, 접근 기록과 보안 업데이트 등 합리적인 보호 조치를 적용합니다.",
    ],
  },
  {
    title: "10. 아동 정보",
    body: [
      "아이로그는 보호자가 입력한 아동 정보를 가족 육아 기록 제공 목적으로 처리합니다.",
      "아동 정보를 등록하는 회원은 해당 정보를 관리할 권한과 필요한 보호자 동의를 확보해야 합니다.",
      "아이의 건강 정보와 맞춤 팁은 육아 기록과 참고를 위한 정보이며 의료 진단, 처방 또는 전문 의료진의 조언을 대체하지 않습니다.",
    ],
  },
  {
    title: "11. 처리방침 변경",
    body: [
      "처리방침이 변경되면 시행일과 주요 변경 내용을 앱 내 공지 등으로 안내합니다.",
      `시행일: ${privacyEffectiveDate} (문서 버전: ${legalDocumentVersions.privacy})`,
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
      "각 오픈소스의 저작권과 라이선스는 해당 프로젝트의 고지와 라이선스 조건을 따릅니다.",
      "앱 업데이트로 포함 라이브러리가 변경되는 경우 이 목록도 함께 갱신합니다.",
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
      <Pressable onPress={() => void openSupportEmail("아이로그 고객지원 문의")} accessibilityRole="button">
        <Text style={styles.footerNote}>고객지원 문의: {supportEmail}</Text>
      </Pressable>
    </SpecShell>
  );
}

export function TermsRoute() {
  return (
    <LegalDocumentRoute
      testID="screen-terms"
      title="이용약관"
      intro={`아이로그를 안전하게 이용하기 위한 서비스 이용 기준입니다. 시행일은 ${termsEffectiveDate}입니다.`}
      sections={termsSections}
    />
  );
}

export function PrivacyPolicyRoute() {
  return (
    <LegalDocumentRoute
      testID="screen-privacy-policy"
      title="개인정보 처리방침"
      intro={`아이로그가 처리하는 개인정보와 이용자의 권리를 안내합니다. 시행일은 ${privacyEffectiveDate}입니다.`}
      sections={privacyPolicySections}
    />
  );
}

export function DeleteAccountRequestRoute() {
  const router = useRouter();

  return (
    <SpecShell testID="screen-delete-account-request">
      <Header title="계정 삭제 요청" onBack={() => router.replace("/login")} />
      <View style={styles.legalIntroCard}>
        <Text style={styles.legalIntroText}>
          아이로그 앱에 로그인할 수 있다면 개인정보 설정의 계정 탈퇴에서 본인 확인 후 바로 요청할 수 있어요.
        </Text>
      </View>
      <View style={styles.legalSection}>
        <Text style={styles.legalSectionTitle}>앱에 로그인할 수 없는 경우</Text>
        <Text style={styles.legalParagraph}>
          아래 버튼으로 삭제 요청 메일을 보내 주세요. 가입한 이메일 주소와 개인 탈퇴 또는 가족 전체 삭제 중 원하는 범위를 적어 주세요.
        </Text>
        <Text style={styles.legalParagraph}>
          본인 확인 후 요청을 처리하며, 가족 전체 삭제는 요청일로부터 30일 동안 취소할 수 있습니다.
        </Text>
      </View>
      <PrimaryButton
        label="삭제 요청 메일 작성"
        onPress={() =>
          void openSupportEmail(
            "[아이로그] 계정 삭제 요청",
            "가입한 이메일 주소:\n요청 범위: 개인 탈퇴 / 가족 전체 삭제\n요청 내용:\n\n본인 확인을 위해 가입한 이메일 주소를 반드시 적어 주세요.",
          )
        }
        testID="delete-account-request-email"
      />
      <Text style={styles.footerNote}>요청 접수: {supportEmail}</Text>
    </SpecShell>
  );
}

export function SupportRoute() {
  const router = useRouter();
  const back = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/login");
  };

  return (
    <SpecShell testID="screen-support">
      <Header title="고객지원" onBack={back} />
      <View style={styles.legalIntroCard}>
        <Text style={styles.legalIntroText}>아이로그 이용 중 도움이 필요하면 아래 문의 채널로 알려 주세요.</Text>
      </View>
      <View style={styles.legalSection}>
        <Text style={styles.legalSectionTitle}>문의 접수</Text>
        <Text style={styles.legalParagraph}>로그인, 가족 초대, 기록, 사진, 알림과 계정 관련 문의를 접수할 수 있어요.</Text>
        <Text style={styles.legalParagraph}>계정 또는 개인정보 관련 요청은 가입한 이메일 주소와 요청 내용을 함께 적어 주세요.</Text>
        <Text style={styles.legalParagraph}>1차 확인·회신 운영 목표는 아동 안전 또는 불법 콘텐츠 신고 1시간 이내, 그 밖의 콘텐츠 신고 24시간 이내, 일반 문의 2영업일 이내입니다. 접수량과 긴급도에 따라 실제 처리 시간은 달라질 수 있어요.</Text>
      </View>
      <View style={styles.legalSection}>
        <Text style={styles.legalSectionTitle}>콘텐츠 신고와 사용자 차단</Text>
        <Text style={styles.legalParagraph}>문제가 있는 대화·댓글·사진·기록 또는 가족 구성원의 신고·차단 메뉴에서 직접 신고해 주세요. 원문 사진을 첨부하지 않고 대상 참조와 사유를 운영자에게 전달하며, 해결 후 90일 이내 삭제해요.</Text>
        <Text style={styles.legalParagraph}>차단은 가족 강퇴가 아니며 공동 육아 기록은 유지돼요. 앱에 접근할 수 없어 메일로 신고할 때도 민감한 개인정보나 불법 이미지를 첨부하지 마세요. 즉각적인 위험은 긴급 신고 기관에 도움을 요청해 주세요.</Text>
        <PrimaryButton label="신고·차단 관리 열기" onPress={() => router.push("/safety")} testID="support-open-safety" />
      </View>
      <View style={styles.legalSection}>
        <Text style={styles.legalSectionTitle}>개인정보 요청</Text>
        <Text style={styles.legalParagraph}>열람, 정정, 삭제, 처리 정지를 요청할 때는 가입한 이메일 주소와 원하는 처리 내용을 적어 주세요.</Text>
        <Text style={styles.legalParagraph}>요청자 확인 뒤 처리 결과를 안내합니다. 가족 전체 삭제는 요청 후 30일 안에 앱에서 취소할 수 있어요.</Text>
      </View>
      <View style={styles.legalSection}>
        <Text style={styles.legalSectionTitle}>오류를 알려 주실 때</Text>
        <Text style={styles.legalParagraph}>오류가 난 화면, 사용한 기능, 발생 시각, 앱 버전과 기기 종류를 알려 주시면 더 빠르게 확인할 수 있어요.</Text>
      </View>
      <PrimaryButton
        label="고객지원 메일 작성"
        onPress={() =>
          void openSupportEmail(
            "[아이로그] 고객지원 문의",
            "문의 유형: 이용 문의 / 개인정보 요청 / 오류 신고 / 앱 접근 불가 신고\n가입한 이메일 주소:\n사용한 기능 또는 화면:\n발생 시각:\n앱 버전 및 기기 종류:\n문의 내용(민감한 개인정보와 불법 이미지는 첨부하지 마세요):\n",
          )
        }
        testID="support-email"
      />
      <Text style={styles.footerNote}>문의: {supportEmail}</Text>
    </SpecShell>
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
  const router = useRouter();
  const params = useLocalSearchParams<{
    return_to?: string | string[];
    invite_code?: string | string[];
    auth_mode?: string | string[];
  }>();
  const returnTo = Array.isArray(params.return_to) ? params.return_to[0] : params.return_to;
  const inviteCode = normalizeFamilyInviteCode(params.invite_code);
  const authMode = Array.isArray(params.auth_mode) ? params.auth_mode[0] : params.auth_mode;
  const back = () => {
    if (returnTo === "signup") {
      router.replace({
        pathname: "/signup",
        params: {
          ...(inviteCode ? { invite_code: inviteCode } : {}),
          ...(authMode === "login" ? { auth_mode: "login" } : {}),
        },
      });
      return;
    }

    if (returnTo === "login") {
      router.replace("/login");
      return;
    }

    router.replace("/app-info");
  };

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
  const app = useBabyBossAppContext();
  const safety = useContentSafetyState();
  const [allVaccinations, setVaccinations] = useState<VaccinationCard[]>([]);
  const vaccinations = safety.status === "ready" ? allVaccinations.filter((entry) => !isSafetyTargetHidden(safety, "VACCINATION_RECORD", entry.id)) : [];
  const [loadMessage, setLoadMessage] = useState<string | null>("예방접종 기록을 불러오는 중...");

  useEffect(() => {
    let isActive = true;

    async function load() {
      if (safety.status !== "ready") return;
      try {
        const session = await restoreSession();
        const rows = await fetchVaccinations(session.family.id);

        if (isActive) {
          setVaccinations(rows);
          setLoadMessage(rows.length > 0 ? null : "예방접종 기록이 아직 없어요.");
        }
      } catch (error) {
        if (isActive) {
          setLoadMessage(null);
          showAppAlert(error instanceof Error ? error.message : "예방접종 기록을 불러오지 못했어요.");
        }
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, [safety, app.session?.caregiver.id]);

  return (
    <SpecShell testID="screen-vaccinations">
      <Header title="예방접종" action="추가" onBack={back} onAction={() => router.push("/vaccination-add")} />
      {safety.status !== "ready" ? <SafetyStateNotice state={safety} /> : null}
      {vaccinations.map((vaccination) => (
        <VaccineRow
          key={vaccination.id}
          title={vaccination.name}
          due={`${vaccinationStatusText(vaccination.status)} ${formatDate(vaccination.completedAt ?? vaccination.dueAt)}`}
          action={<SafetyActions target={{ type: "VACCINATION_RECORD", id: vaccination.id, caregiverId: vaccination.createdById }} currentCaregiverId={app.session?.caregiver.id} testID={`vaccination-safety-${vaccination.id}`} />}
        />
      ))}
      <ActionStatus message={loadMessage} />
      <Text style={styles.footerNote}>예정일은 변경될 수 있어요.</Text>
    </SpecShell>
  );
}

function VaccineRow({ title, due, action }: { title: string; due: string; action?: ReactNode }) {
  return <ListRow title={title} subtitle={due} icon="vaccine" action={action} />;
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
  const app = useBabyBossAppContext();
  const safety = useContentSafetyState();
  const [allVisits, setVisits] = useState<HospitalVisitCard[]>([]);
  const visits = safety.status === "ready" ? allVisits.filter((entry) => !isSafetyTargetHidden(safety, "HOSPITAL_VISIT", entry.id)) : [];
  const [loadMessage, setLoadMessage] = useState<string | null>("병원 방문 기록을 불러오는 중...");

  useEffect(() => {
    let isActive = true;

    async function load() {
      if (safety.status !== "ready") return;
      try {
        const session = await restoreSession();
        const rows = await fetchHospitalVisits(session.family.id);

        if (isActive) {
          setVisits(rows);
          setLoadMessage(rows.length > 0 ? null : "병원 방문 기록이 아직 없어요.");
        }
      } catch (error) {
        if (isActive) {
          setLoadMessage(null);
          showAppAlert(error instanceof Error ? error.message : "병원 방문 기록을 불러오지 못했어요.");
        }
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, [safety, app.session?.caregiver.id]);

  return (
    <SpecShell testID="screen-hospital-visits">
      <Header title="병원 방문" action="추가" onBack={back} onAction={() => router.push("/hospital-add")} />
      {safety.status !== "ready" ? <SafetyStateNotice state={safety} /> : null}
      {visits.map((visit) => (
        <ListRow
          key={visit.id}
          title={visit.hospitalName}
          subtitle={[formatDate(visit.visitedAt), visit.reason ?? visit.diagnosis].filter(Boolean).join(" · ")}
          icon="hospital"
          action={<SafetyActions target={{ type: "HOSPITAL_VISIT", id: visit.id, caregiverId: visit.createdById }} currentCaregiverId={app.session?.caregiver.id} testID={`hospital-safety-${visit.id}`} />}
        />
      ))}
      <ActionStatus message={loadMessage} />
    </SpecShell>
  );
}

export function FamilyChatRoute() {
  const router = useRouter();
  const app = useBabyBossAppContext();
  const sessionIdentity = `${app.session?.family.id ?? ""}:${app.session?.caregiver.id ?? ""}`;
  const currentSessionIdentityRef = useRef(sessionIdentity);
  currentSessionIdentityRef.current = sessionIdentity;
  const params = useLocalSearchParams<{
    familyChatMessageId?: string | string[];
    notificationTap?: string | string[];
  }>();
  const targetMessageId = parsePositiveRecordId(params.familyChatMessageId);
  const notificationTap = Array.isArray(params.notificationTap) ? params.notificationTap[0] : params.notificationTap;
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetMessage, setTargetMessage] = useState<FamilyChatMessageCard | null>(null);
  const [targetLoadError, setTargetLoadError] = useState<string | null>(null);
  const [targetRetryAttempt, setTargetRetryAttempt] = useState(0);
  const targetActivationKey = targetMessageId == null
    ? null
    : [targetMessageId, notificationTap ?? "", targetRetryAttempt].join(":");
  const refreshFamilyChatRef = useRef(app.refreshFamilyChat);

  useEffect(() => { setIsSending(false); setLoadError(null); }, [sessionIdentity]);

  useAppAlert(loadError);

  useEffect(() => {
    refreshFamilyChatRef.current = app.refreshFamilyChat;
  }, [app.refreshFamilyChat]);

  useEffect(() => {
    if (!app.session) {
      return;
    }

    void refreshFamilyChatRef.current().catch((error) => {
      setLoadError(error instanceof Error ? error.message : "가족 대화를 불러오지 못했어요.");
    });
  }, [app.session?.family.id]);

  useEffect(() => {
    let isActive = true;
    const familyId = app.session?.family.id;

    setTargetMessage(null);
    setTargetLoadError(null);
    if (familyId == null || targetMessageId == null) {
      return () => {
        isActive = false;
      };
    }

    void fetchFamilyChatMessage(familyId, targetMessageId)
      .then((message) => {
        if (!isActive) {
          return;
        }

        setTargetMessage(message);
        if (!message) {
          setTargetLoadError("해당 가족 메시지를 찾을 수 없어요.");
        }
      })
      .catch((error) => {
        if (isActive) {
          setTargetLoadError(error instanceof Error ? error.message : "알림 메시지를 불러오지 못했어요.");
        }
      });

    return () => {
      isActive = false;
    };
  }, [app.session?.family.id, notificationTap, targetMessageId, targetRetryAttempt]);

  useFocusEffect(
    useCallback(() => {
      const familyId = app.session?.family.id;
      const caregiverId = app.session?.caregiver.id;

      if (familyId == null || caregiverId == null) {
        return undefined;
      }

      const activeFamilyId: number = familyId;
      const sessionKey = [
        "family-chat",
        caregiverId,
        Date.now().toString(36),
        Math.random().toString(36).slice(2),
      ].join("-");
      let routeActive = true;
      let appIsActive = AppState.currentState === "active";
      let presenceQueue = Promise.resolve();

      function queuePresenceUpdate(nextActive: boolean) {
        presenceQueue = presenceQueue
          .catch(() => undefined)
          .then(async () => {
            if (nextActive) {
              await touchFamilyChatPresence(activeFamilyId, sessionKey);
            } else {
              await clearFamilyChatPresence(activeFamilyId, sessionKey);
            }
          })
          .catch(() => {
            console.warn("Failed to update family chat presence.");
          });
      }

      queuePresenceUpdate(appIsActive);
      const heartbeat = setInterval(() => {
        if (routeActive && appIsActive) {
          queuePresenceUpdate(true);
        }
      }, familyChatPresenceHeartbeatMs);
      const appStateSubscription = AppState.addEventListener("change", (nextState) => {
        const nextAppIsActive = nextState === "active";

        if (appIsActive === nextAppIsActive) {
          return;
        }

        appIsActive = nextAppIsActive;
        queuePresenceUpdate(routeActive && appIsActive);
      });

      return () => {
        routeActive = false;
        clearInterval(heartbeat);
        appStateSubscription.remove();
        queuePresenceUpdate(false);
      };
    }, [app.session?.caregiver.id, app.session?.family.id]),
  );

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
      const expectedSession = { familyId: app.session.family.id, caregiverId: app.session.caregiver.id };
      const createdMessage = await createFamilyChatMessage(expectedSession.familyId, payload);
      if (currentSessionIdentityRef.current !== sessionIdentity) throw new Error("로그인 상태가 바뀌었어요. 현재 계정에서 대화를 다시 확인해 주세요.");
      app.applyFamilyChatMessage(createdMessage, expectedSession);
      void app.refreshFamilyChat().catch((error) => {
        if (currentSessionIdentityRef.current === sessionIdentity) setLoadError(error instanceof Error ? error.message : "가족 대화를 최신 상태로 불러오지 못했어요.");
      });
      return createdMessage;
    } finally {
      if (currentSessionIdentityRef.current === sessionIdentity) setIsSending(false);
    }
  }

  return (
    <FamilyChatView
      messages={app.familyChat?.messages ?? null}
      currentCaregiver={app.session?.caregiver ?? null}
      sending={isSending}
      targetMessageId={targetMessageId}
      targetActivationKey={targetActivationKey}
      targetMessage={targetMessage}
      targetLoadError={targetLoadError}
      onBack={() => router.replace("/home")}
      onRetryTarget={() => setTargetRetryAttempt((current) => current + 1)}
      onSend={sendMessage}
    />
  );
}

export function PhotoAlbumRoute() {
  const back = useFallbackBack("/settings");
  const app = useBabyBossAppContext();
  const safety = useContentSafetyState();
  const { width: viewportWidth } = useWindowDimensions();
  const [photos, setPhotos] = useState<FamilyPhotoCard[]>(() =>
    app.session ? getCachedPhotoAlbum(app.session.family.id) ?? [] : [],
  );
  const [loadMessage, setLoadMessage] = useState<string | null>(() => {
    const cachedPhotos = app.session ? getCachedPhotoAlbum(app.session.family.id) : null;

    if (!cachedPhotos) {
      return "사진 기록을 불러오는 중...";
    }

    return cachedPhotos.length > 0 ? null : "사진 기록이 아직 없어요.";
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentCaregiverId, setCurrentCaregiverId] = useState<number | null>(app.session?.caregiver.id ?? null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [isDeleteConfirmationVisible, setIsDeleteConfirmationVisible] = useState(false);
  const [photoSourceVisible, setPhotoSourceVisible] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<FamilyPhotoCard | null>(null);
  const [photoGrouping, setPhotoGrouping] = useState<PhotoAlbumGrouping>("day");
  const photoTileSize = Math.max(1, Math.floor((Math.min(viewportWidth, 390) - 32 - 16) / 3));
  const visiblePhotos = safety.status === "ready" ? photos.filter((photo) => !isSafetyTargetHidden(safety, photo.source === "ALBUM" ? "FAMILY_PHOTO" : "RECORD_ATTACHMENT", photo.sourceId)) : [];

  useEffect(() => {
    if (safety.status !== "ready") {
      setPreviewPhoto(null);
      setSelectedPhotoIds([]);
      setIsDeleteConfirmationVisible(false);
    } else if (previewPhoto && isSafetyTargetHidden(safety, previewPhoto.source === "ALBUM" ? "FAMILY_PHOTO" : "RECORD_ATTACHMENT", previewPhoto.sourceId)) setPreviewPhoto(null);
  }, [previewPhoto, safety]);

  useEffect(() => {
    if (app.session?.caregiver.id != null) {
      setCurrentCaregiverId(app.session.caregiver.id);
    }
  }, [app.session?.caregiver.id]);

  useEffect(() => {
    let isActive = true;

    async function load() {
      if (safety.status !== "ready") return;
      try {
        const session = app.session ?? (await restoreSession());
        const cachedPhotos = getCachedPhotoAlbum(session.family.id);

        if (cachedPhotos && isActive) {
          setCurrentCaregiverId(session.caregiver.id);
          setPhotos(cachedPhotos);
          setLoadMessage(cachedPhotos.length > 0 ? null : "사진 기록이 아직 없어요.");
        }

        const rows = await fetchPhotoAlbum(session.family.id, { force: true });

        if (isActive) {
          setCurrentCaregiverId(session.caregiver.id);
          setPhotos(rows);
          setLoadMessage(rows.length > 0 ? null : "사진 기록이 아직 없어요.");
        }
      } catch (error) {
        if (isActive) {
          setLoadMessage(null);
          showAppAlert(error instanceof Error ? error.message : "사진 기록을 불러오지 못했어요.");
        }
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, [app.session, safety]);

  async function addPhoto(source: FamilyPhotoPickerSource) {
    if (isUploading || isDeleting || isDownloading) {
      return;
    }

    setPhotoSourceVisible(false);

    try {
      const assets = await pickFamilyPhotoAssets(source);

      if (assets.length === 0) {
        return;
      }

      setIsUploading(true);
      const session = app.session ?? (await restoreSession());
      setLoadMessage(`사진 ${assets.length}장을 업로드하는 중이에요.`);
      const {
        uploadedPhotos,
        failedMessages,
        savedPhotoCount,
        previewRefreshRequired,
      } = await uploadFamilyPhotoAssets(session.family.id, assets);

      if (uploadedPhotos.length > 0) {
        setPhotos((current) =>
          [...uploadedPhotos, ...current].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
        );
      }

      if (previewRefreshRequired > 0) {
        setLoadMessage(savedPhotoCount === 1 ? "사진 앨범에 저장했어요." : `사진 ${savedPhotoCount}장을 앨범에 저장했어요.`);
        showAppAlert("사진은 저장했지만 일부 미리보기를 바로 불러오지 못했어요. 앨범을 다시 열어 확인해 주세요.");
      } else if (failedMessages.length === 0) {
        setLoadMessage(savedPhotoCount === 1 ? "사진 앨범에 저장했어요." : `사진 ${savedPhotoCount}장을 앨범에 저장했어요.`);
      } else if (savedPhotoCount > 0) {
        setLoadMessage(`사진 ${savedPhotoCount}장을 앨범에 저장했어요.`);
        showAppAlert(`사진 ${failedMessages.length}장은 업로드하지 못했어요. 다시 시도해 주세요.`);
      } else {
        setLoadMessage(null);
        showAppAlert(failedMessages[0] ?? "사진을 업로드하지 못했어요.");
      }
    } catch (error) {
      setLoadMessage(null);
      showAppAlert(error instanceof Error ? error.message : "사진을 업로드하지 못했어요.");
    } finally {
      setIsUploading(false);
    }
  }

  const activeCaregiverId = app.session?.caregiver.id ?? currentCaregiverId;
  const selectedPhotos = visiblePhotos.filter((photo) => selectedPhotoIds.includes(photo.id));
  const selectedDeletablePhotos = selectedPhotos.filter((photo) => isDirectFamilyAlbumPhoto(photo, activeCaregiverId));

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

    if (photos.length === 0) {
      showAppAlert("선택할 사진이 없어요.");
      return;
    }

    setIsSelectionMode(true);
    setLoadMessage("사진을 선택해 내려받거나 삭제할 수 있어요.");
  }

  function handlePhotoPress(photo: FamilyPhotoCard) {
    if (!isSelectionMode) {
      setPreviewPhoto(photo);
      return;
    }

    setSelectedPhotoIds((current) => togglePhotoSelection(current, photo.id));
  }

  function prefetchPhotoPreview(photo: FamilyPhotoCard) {
    if (isSelectionMode) {
      return;
    }

    void CachedImage.prefetch(photo.imageUrl, "memory-disk").catch(() => undefined);
  }

  function handlePhotoLongPress(photo: FamilyPhotoCard) {
    if (isSelectionMode) {
      return;
    }

    setIsSelectionMode(true);
    setSelectedPhotoIds([photo.id]);
    setLoadMessage("사진을 선택했어요.");
  }

  function openDeleteConfirmation() {
    if (selectedPhotoIds.length === 0) {
      showAppAlert("삭제할 사진을 먼저 선택해 주세요.");
      return;
    }

    if (selectedDeletablePhotos.length === 0) {
      showAppAlert("내가 직접 올린 앨범 사진만 삭제할 수 있어요.");
      return;
    }

    setIsDeleteConfirmationVisible(true);
  }

  async function deleteSelectedPhotos() {
    if (selectedDeletablePhotos.length === 0) {
      showAppAlert("삭제할 사진을 찾지 못했어요.");
      return;
    }

    setIsDeleting(true);
    setIsDeleteConfirmationVisible(false);

    try {
      const session = app.session ?? (await restoreSession());
      const deletedPhotoIds: number[] = [];
      const failedDeletes: string[] = [];
      setLoadMessage(`사진 ${selectedDeletablePhotos.length}장을 삭제하는 중이에요.`);
      const deleteResults = await runPhotoAlbumOperations(
        selectedDeletablePhotos,
        (photo) => deleteFamilyPhoto(session.family.id, photo.sourceId),
        PHOTO_ALBUM_OPERATION_CONCURRENCY,
      );

      for (const [index, result] of deleteResults.entries()) {
        if (result.status === "fulfilled") {
          deletedPhotoIds.push(selectedDeletablePhotos[index].sourceId);
        } else {
          failedDeletes.push(result.reason instanceof Error ? result.reason.message : "사진을 삭제하지 못했어요.");
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
        setSelectedPhotoIds((current) =>
          current.filter(
            (photoId) => !selectedDeletablePhotos.some((photo) => photo.id === photoId && deletedPhotoIds.includes(photo.sourceId)),
          ),
        );
        setLoadMessage(deletedPhotoIds.length > 0 ? `사진 ${deletedPhotoIds.length}장을 삭제했어요.` : null);
        showAppAlert(
          deletedPhotoIds.length > 0
            ? `사진 ${failedDeletes.length}장은 삭제하지 못했어요. 다시 시도해 주세요.`
            : failedDeletes[0] ?? "사진을 삭제하지 못했어요.",
        );
      }
    } catch (error) {
      setLoadMessage(null);
      showAppAlert(error instanceof Error ? error.message : "사진을 삭제하지 못했어요.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function downloadPhotos(selected: readonly FamilyPhotoCard[]) {
    if (selected.length === 0) {
      showAppAlert("내려받을 사진을 먼저 선택해 주세요.");
      return;
    }

    setIsDownloading(true);
    setLoadMessage(`사진 ${selected.length}장을 저장하는 중이에요.`);

    try {
      const result = await downloadFamilyPhotos(selected);

      if (result.failures.length === 0) {
        setLoadMessage(result.downloadedCount === 1 ? "사진을 기기에 저장했어요." : `사진 ${result.downloadedCount}장을 기기에 저장했어요.`);
      } else if (result.downloadedCount > 0) {
        setLoadMessage(`사진 ${result.downloadedCount}장을 기기에 저장했어요.`);
        showAppAlert(`사진 ${result.failures.length}장은 저장하지 못했어요. 다시 시도해 주세요.`);
      } else {
        setLoadMessage(null);
        showAppAlert(result.failures[0]?.message ?? "사진을 저장하지 못했어요.");
      }
    } catch (error) {
      setLoadMessage(null);
      showAppAlert(error instanceof Error ? error.message : "사진을 저장하지 못했어요.");
    } finally {
      setIsDownloading(false);
    }
  }

  const photoGroups = groupPhotoAlbumPhotos(visiblePhotos, photoGrouping);

  return (
    <SpecShell
      testID="screen-photo-album"
      overlay={
        <View style={styles.albumGroupingFloating}>
          <View style={styles.albumGroupingControl} testID="photo-album-grouping">
            {photoAlbumGroupingOptions.map((option, index) => (
              <Pressable
                key={option.key}
                style={[
                  styles.albumGroupingOption,
                  index > 0 && styles.albumGroupingOptionDivider,
                  photoGrouping === option.key && styles.albumGroupingOptionActive,
                ]}
                onPress={() => setPhotoGrouping(option.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: photoGrouping === option.key }}
                accessibilityLabel={`${option.label} 단위로 사진 보기`}
                testID={`photo-album-group-${option.key}`}>
                <Text style={[styles.albumGroupingOptionText, photoGrouping === option.key && styles.albumGroupingOptionTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      }>
      <Header
        title="사진 앨범"
        action={isUploading ? "업로드 중" : "추가"}
        actionTestID="photo-album-add"
        onBack={back}
        onAction={() => {
          if (!isUploading && !isDeleting && !isDownloading) {
            setPhotoSourceVisible(true);
          }
        }}
      />
      <View style={styles.albumActionRow}>
        <View style={styles.albumSelectionActions}>
          <Pressable
            style={[styles.albumActionButton, isSelectionMode && styles.albumActionButtonActive]}
            onPress={toggleSelectionMode}
            disabled={isUploading || isDeleting || isDownloading}
            accessibilityRole="button"
            accessibilityLabel={isSelectionMode ? "사진 선택 취소" : "사진 선택"}
            testID="photo-album-select">
            <RecordIcon name={isSelectionMode ? "close" : "confirm-check"} size={16} color={primary} strokeWidth={2.4} />
            <Text style={styles.albumActionButtonText}>{isSelectionMode ? "취소" : "선택"}</Text>
          </Pressable>
          {isSelectionMode ? (
            <>
              <Pressable
                style={[styles.albumDownloadButton, (selectedPhotos.length === 0 || isDownloading) && styles.albumDownloadButtonDisabled]}
                onPress={() => void downloadPhotos(selectedPhotos)}
                disabled={selectedPhotos.length === 0 || isDownloading}
                accessibilityRole="button"
                accessibilityLabel={isDownloading ? "사진 저장 중" : `선택한 사진 ${selectedPhotos.length}장 다운로드`}
                testID="photo-album-download">
                <RecordIcon name="download" size={17} color={brandColors.onAction} strokeWidth={2.3} />
              </Pressable>
              <Pressable
                style={[styles.albumDeleteButton, (selectedDeletablePhotos.length === 0 || isDeleting || isDownloading) && styles.albumDeleteButtonDisabled]}
                onPress={openDeleteConfirmation}
                disabled={selectedDeletablePhotos.length === 0 || isDeleting || isDownloading}
                accessibilityRole="button"
                testID="photo-album-delete">
                <RecordIcon name="delete" size={16} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.albumDeleteButtonText}>{isDeleting ? "삭제 중" : `삭제 ${selectedDeletablePhotos.length > 0 ? selectedDeletablePhotos.length : ""}`}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
      {photoGroups.map((group) => (
        <View key={group.key} style={styles.albumSection} testID={`photo-album-section-${group.key}`}>
          <Text style={styles.sectionLabel} testID="photo-album-group-label">{group.label}</Text>
          <View style={styles.photoGrid} testID="photo-album-grid">
            {group.photos.map((photo) => {
              const isSelected = selectedPhotoIds.includes(photo.id);

              return (
              <Pressable
                key={photo.id}
                style={[
                  styles.photoTile,
                  { width: photoTileSize, height: photoTileSize },
                  isSelected && styles.photoTileSelected,
                ]}
                onPressIn={() => prefetchPhotoPreview(photo)}
                onPress={() => handlePhotoPress(photo)}
                onLongPress={() => handlePhotoLongPress(photo)}
                disabled={isDeleting}
                accessibilityRole="button"
                accessibilityLabel={isSelectionMode ? `${photo.createdByName}님 사진 선택` : `${photo.createdByName}님 사진 전체보기`}
                accessibilityState={{ selected: isSelected }}
                testID={`photo-album-item-${photo.id}`}>
                <CachedImage
                  source={photo.imageUrl}
                  style={styles.albumPhotoImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                  recyclingKey={photo.id}
                />
                {isSelectionMode ? (
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

      {safety.status !== "ready" ? <SafetyStateNotice state={safety} /> : null}

      <FamilyPhotoSourceModal
        visible={photoSourceVisible}
        busy={isUploading}
        onClose={() => setPhotoSourceVisible(false)}
        onCamera={() => void addPhoto("camera")}
        onLibrary={() => void addPhoto("library")}
        testID="photo-album-source"
      />

      <FamilyImagePreviewModal
        visible={Boolean(previewPhoto)}
        imageUrl={previewPhoto?.imageUrl ?? null}
        title={previewPhoto ? `${previewPhoto.createdByName}님의 사진` : undefined}
        subtitle={previewPhoto?.caption}
        onClose={() => setPreviewPhoto(null)}
        onDownload={() => {
          if (previewPhoto) {
            void downloadPhotos([previewPhoto]);
          }
        }}
        isDownloading={isDownloading}
        headerAction={previewPhoto ? <SafetyActions target={{ type: previewPhoto.source === "ALBUM" ? "FAMILY_PHOTO" : "RECORD_ATTACHMENT", id: previewPhoto.sourceId, caregiverId: previewPhoto.createdById, displayName: previewPhoto.createdByName }} currentCaregiverId={activeCaregiverId} testID="photo-album-preview-safety" inverse onChanged={() => setPreviewPhoto(null)} /> : null}
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
        : ["맘마", "열", "감기", "예방접종"].map((item) => (
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
    maxWidth: Platform.OS === "web" ? 390 : undefined,
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
    pointerEvents: "none",
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
  familyInviteSection: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
    paddingTop: 18,
  },
  familyInviteDescription: {
    color: muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  familyInviteActions: {
    flexDirection: "row",
    gap: 10,
  },
  familyInviteActionButton: {
    minHeight: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFE6DF",
    backgroundColor: "#F6FBFA",
    paddingHorizontal: 10,
  },
  familyInviteActionButtonDisabled: {
    opacity: 0.48,
  },
  familyInviteActionButtonText: {
    color: primary,
    fontSize: 13,
    fontWeight: "800",
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
  recordAgeGuidance: {
    gap: 10,
    borderWidth: 1,
    borderColor: "#CDE9E5",
    borderRadius: 8,
    backgroundColor: "#F8FCFB",
    padding: 13,
  },
  recordAgeGuidanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recordAgeGuidanceIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#E3F6F2",
  },
  recordAgeGuidanceCopy: {
    flex: 1,
    gap: 3,
  },
  recordAgeGuidanceTitle: {
    color: "#1F2937",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  recordAgeGuidanceEyebrow: {
    color: "#16877D",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  recordAgeGuidanceDivider: {
    height: 1,
    backgroundColor: "#DDEEEB",
  },
  recordAgeGuidanceBody: {
    gap: 5,
  },
  recordAgeGuidanceHeadline: {
    color: "#1F2937",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  recordAgeGuidanceDetail: {
    color: "#52657E",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  recordAgeGuidanceCaution: {
    flex: 1,
    color: "#718096",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  recordAgeGuidanceCautionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    borderRadius: 6,
    backgroundColor: "#EFF7F5",
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  recordAgeGuidanceCautionLabel: {
    color: "#16877D",
    fontSize: 10,
    lineHeight: 16,
    fontWeight: "800",
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
  timeDropdownRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  timeDropdownColumn: {
    flex: 1,
    gap: 5,
  },
  timeDropdownLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  timeDropdownButton: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#DDE7E2",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  timeDropdownButtonOpen: {
    borderColor: primary,
    backgroundColor: paleBlue,
  },
  timeDropdownValue: {
    color: text,
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timeDropdownMenu: {
    maxHeight: 150,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE7E2",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  timeDropdownScroll: {
    maxHeight: 148,
  },
  timeDropdownOption: {
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EFEC",
  },
  timeDropdownOptionSelected: {
    backgroundColor: paleBlue,
  },
  timeDropdownOptionText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  timeDropdownOptionTextSelected: {
    color: primary,
    fontWeight: "800",
  },
  pickerDoneButton: {
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: brandColors.action,
  },
  pickerDoneText: {
    color: brandColors.onAction,
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
    backgroundColor: brandColors.action,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: brandColors.onAction,
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
    borderColor: brandColors.actionPressed,
    backgroundColor: brandColors.action,
  },
  segmentText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: brandColors.onAction,
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
    borderColor: brandColors.actionPressed,
    backgroundColor: brandColors.action,
  },
  chipText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextActive: {
    color: brandColors.onAction,
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
  recordDetailCard: {
    gap: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    backgroundColor: "#FFFFFF",
    padding: 18,
  },
  recordDetailHeader: {
    gap: 5,
    paddingBottom: 2,
  },
  recordDetailKind: {
    color: primary,
    fontSize: 12,
    fontWeight: "700",
  },
  recordDetailTitle: {
    color: text,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "800",
  },
  ambiguousGrowthDescription: {
    color: muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  ambiguousGrowthCandidate: {
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ambiguousGrowthCandidateCopy: {
    flex: 1,
    gap: 4,
  },
  ambiguousGrowthCandidateTitle: {
    color: text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
  },
  ambiguousGrowthCandidateDate: {
    color: muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  ambiguousGrowthCandidateSummary: {
    color: text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  ambiguousGrowthCandidateAction: {
    color: primary,
    fontSize: 12,
    fontWeight: "800",
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
    justifyContent: "flex-end",
    gap: 8,
  },
  albumGroupingFloating: {
    position: "absolute",
    right: 0,
    bottom: 20,
    left: 0,
    alignItems: "center",
    zIndex: 20,
    pointerEvents: "box-none",
  },
  albumGroupingControl: {
    width: 260,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#BFE4DF",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    boxShadow: "0 8px 18px rgba(22, 135, 125, 0.16)",
  },
  albumGroupingOption: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  albumGroupingOptionDivider: {
    borderLeftWidth: 1,
    borderLeftColor: "#DDEEEB",
  },
  albumGroupingOptionActive: {
    backgroundColor: brandColors.tint,
  },
  albumGroupingOptionText: {
    color: "#718096",
    fontSize: 13,
    fontWeight: "700",
  },
  albumGroupingOptionTextActive: {
    color: brandColors.primary,
  },
  albumSelectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  albumActionButton: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFE4DF",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
  },
  albumActionButtonActive: {
    backgroundColor: "#F0FAF8",
  },
  albumActionButtonText: {
    color: "#16877D",
    fontSize: 11,
    fontWeight: "700",
  },
  albumDeleteButton: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
  },
  albumDeleteButtonDisabled: {
    backgroundColor: "#FCA5A5",
  },
  albumDownloadButton: {
    width: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: brandColors.action,
  },
  albumDownloadButtonDisabled: {
    backgroundColor: "#9FD8D2",
  },
  albumDeleteButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoTile: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: soft,
    overflow: "hidden",
  },
  photoTileSelected: {
    borderWidth: 2,
    borderColor: brandColors.actionPressed,
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
    backgroundColor: brandColors.action,
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
