import {type Dispatch, type ReactNode, type SetStateAction, useCallback, useEffect, useMemo, useState} from "react";
import {Link, Slot, useLocalSearchParams, usePathname, useRouter} from "expo-router";
import {
    Image,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    type KeyboardTypeOptions,
    useWindowDimensions,
    View
} from "react-native";
import {
    BarChart as GiftedBarChart,
    LineChart as GiftedLineChart
} from "react-native-gifted-charts";
import Svg, {Circle, Line, Path, Polyline, Rect, Text as SvgText} from "react-native-svg";
import {useSafeAreaInsets} from "react-native-safe-area-context";

import {
    fetchGrowthMeasurements,
    fetchHospitalVisits,
    fetchLogs,
    fetchTasks,
    fetchVaccinations,
    getCachedPhotoAlbum,
    restoreSession,
    type FamilyPhotoCard,
    type GrowthMeasurementCard,
    type HospitalVisitCard,
    type LogCard,
    type TaskCard,
    type VaccinationCard
} from "../api";
import {
    CalendarDatePickerOverlay,
    defaultStatsDate,
    endOfWeek,
    formatDateRangeLabel,
    formatStatsRangeLabel,
    shiftDateByPeriod,
    startOfWeek,
    type DateRange,
} from "../features/shared/CalendarDatePicker";
import {AlertsView} from "../features/alerts/AlertsView";
import {AuthView} from "../features/auth/AuthView";
import {AppleSignInButton} from "../features/auth/AppleSignInButton";
import {GoogleSignInButton} from "../features/auth/GoogleSignInButton";
import {ChatView} from "../features/chat/ChatView";
import {
    TIMELINE_COMPOSER_MAX_HEIGHT,
    TIMELINE_COMPOSER_RESTING_BOTTOM,
    resolveTimelineFamilyChatBottom,
    resolveTimelineComposerBottom,
    timelineComposerContentPaddingBottom,
} from "../features/chat/timelineComposerLayout";
import {DashboardView, TaskRegistrationModal} from "../features/dashboard/DashboardView";
import {TaskListView} from "../features/dashboard/TaskListView";
import {SettingsView} from "../features/settings/SettingsView";
import {resolveBottomTabBarOffset} from "../features/shared/bottomTabLayout";
import {showAppAlert, useAppAlert} from "../features/shared/appAlerts";
import {feedingMetricForLog, summarizeFeedingLogs} from "../features/shared/feedingRecord";
import {FamilyPhotoSourceModal} from "../features/shared/FamilyPhotoSourceModal";
import {
    pickFamilyPhotoAssets,
    uploadFamilyPhotoAssets,
    type FamilyPhotoPickerSource,
} from "../features/shared/familyPhotoUpload";
import {RecordIcon, type RecordIconName} from "../features/shared/RecordIcon";
import {getFamilyInviteAppLink, getFamilyInviteStoreLinks, normalizeFamilyInviteCode} from "../features/shared/familyInviteLinks";
import {useBabyBossAppContext} from "../hooks/BabyBossAppContext";
import {useKeyboardInset} from "../hooks/useKeyboardInset";
import {FONT_FAMILY} from "../typography";

type BottomTab = "dashboard" | "timeline" | "statistics" | "settings";
type TabGlyphName = "home" | "record" | "stats" | "more";
type StatPeriod = "daily" | "weekly" | "monthly";
type StatCategoryKey =
    | "feeding"
    | "sleep"
    | "diaper"
    | "temperature"
    | "medicine"
    | "pumping"
    | "growth"
    | "vaccination"
    | "hospital";
type StatChartPoint = {
    value: number;
    label: string;
    timestamp: number;
};
const primary = "#4DB6AC";
const bg = "#FFFFFF";
const card = "#F8F9FB";
const border = "#E9EDF3";
const text = "#111827";
const muted = "#6B7280";
const paleBlue = "#E7F6F3";
const safeTop = 22;
const horizontalGutter = 16;
const overviewChartHeight = 152;
const overviewChartPlotBaseline = 124;
const overviewChartLabelY = 144;
const authBrandLogo = require("../../assets/ilog-logo-transparent.png");
const softShadow = {
    boxShadow: "0 5px 12px rgba(100, 116, 139, 0.06)",
};
const tabRoutes = {
    dashboard: "/home",
    timeline: "/timeline",
    statistics: "/statistics",
    settings: "/settings",
} as const;
const recordAddRoutes = {
    feeding: "/feeding-add",
    sleep: "/sleep-add",
    diaper: "/diaper-add",
    temperature: "/temperature-add",
    medicine: "/medicine-add",
    pumping: "/pumping-add",
    memo: "/memo-add",
    growth: "/growth-add",
    vaccination: "/vaccination-add",
    hospital: "/hospital-add",
} as const;
type RecordAddRoute = (typeof recordAddRoutes)[keyof typeof recordAddRoutes];
type StatCategory = {
    key: StatCategoryKey;
    label: string;
    icon: RecordIconName;
    route: string;
    chart: "bar" | "line";
    value: Record<StatPeriod, string>;
    meta: Record<StatPeriod, string>;
    chartData: StatChartPoint[];
    hasData: boolean;
};
const statPeriods: {key: StatPeriod; label: string}[] = [
    {key: "daily", label: "일간"},
    {key: "weekly", label: "주간"},
    {key: "monthly", label: "월간"},
];
const statCategories: StatCategory[] = [
    {
        key: "feeding",
        label: "맘마",
        icon: "feeding",
        route: "/stats-feeding",
        chart: "bar",
        value: {daily: "기록 없음", weekly: "기록 없음", monthly: "기록 없음"},
        meta: {daily: "기록 없음", weekly: "기록 없음", monthly: "기록 없음"},
        chartData: [],
        hasData: false,
    },
    {
        key: "sleep",
        label: "잠",
        icon: "sleep",
        route: "/stats-sleep",
        chart: "line",
        value: {daily: "0 분", weekly: "0 분", monthly: "0 분"},
        meta: {daily: "기록 없음", weekly: "기록 없음", monthly: "기록 없음"},
        chartData: [],
        hasData: false,
    },
    {
        key: "diaper",
        label: "기저귀",
        icon: "diaper",
        route: "/stats-diaper",
        chart: "bar",
        value: {daily: "0 회", weekly: "0 회", monthly: "0 회"},
        meta: {daily: "기록 없음", weekly: "기록 없음", monthly: "기록 없음"},
        chartData: [],
        hasData: false,
    },
    {
        key: "temperature",
        label: "체온",
        icon: "temperature",
        route: "/stats-temperature",
        chart: "line",
        value: {daily: "- ℃", weekly: "- ℃", monthly: "- ℃"},
        meta: {daily: "기록 없음", weekly: "기록 없음", monthly: "기록 없음"},
        chartData: [],
        hasData: false,
    },
    {
        key: "medicine",
        label: "약/영양제",
        icon: "medicine",
        route: "/stats-medicine",
        chart: "bar",
        value: {daily: "0 회", weekly: "0 회", monthly: "0 회"},
        meta: {daily: "기록 없음", weekly: "기록 없음", monthly: "기록 없음"},
        chartData: [],
        hasData: false,
    },
    {
        key: "pumping",
        label: "유축",
        icon: "pumping",
        route: "/stats-pumping",
        chart: "bar",
        value: {daily: "0 ml", weekly: "0 ml", monthly: "0 ml"},
        meta: {daily: "기록 없음", weekly: "기록 없음", monthly: "기록 없음"},
        chartData: [],
        hasData: false,
    },
    {
        key: "growth",
        label: "성장",
        icon: "growth",
        route: "/stats-growth",
        chart: "line",
        value: {daily: "0 건", weekly: "0 건", monthly: "0 건"},
        meta: {daily: "기록 없음", weekly: "기록 없음", monthly: "기록 없음"},
        chartData: [],
        hasData: false,
    },
    {
        key: "vaccination",
        label: "예방접종",
        icon: "vaccine",
        route: "/stats-vaccination",
        chart: "bar",
        value: {daily: "0 건", weekly: "0 건", monthly: "0 건"},
        meta: {daily: "기록 없음", weekly: "기록 없음", monthly: "기록 없음"},
        chartData: [],
        hasData: false,
    },
    {
        key: "hospital",
        label: "병원 방문",
        icon: "hospital",
        route: "/stats-hospital",
        chart: "bar",
        value: {daily: "0 건", weekly: "0 건", monthly: "0 건"},
        meta: {daily: "기록 없음", weekly: "기록 없음", monthly: "기록 없음"},
        chartData: [],
        hasData: false,
    },
];

function buildApiStatCategories({
                                    logs,
                                    vaccinations,
                                    hospitalVisits,
                                    period,
                                }: {
    logs: LogCard[];
    vaccinations: VaccinationCard[];
    hospitalVisits: HospitalVisitCard[];
    period: StatPeriod;
}): StatCategory[] {
    return statCategories.map((category) => {
        if (category.key === "vaccination") {
            return buildDatedCountStatCategory(
                category,
                vaccinations.map((record) => ({
                    timestamp: Date.parse(record.completedAt ?? record.dueAt),
                })),
                period,
            );
        }

        if (category.key === "hospital") {
            return buildDatedCountStatCategory(
                category,
                hospitalVisits.map((record) => ({
                    timestamp: Date.parse(record.visitedAt),
                })),
                period,
            );
        }

        const categoryLogs = logs.filter((log) => matchesStatCategory(category.key, log));

        if (categoryLogs.length === 0) {
            return category;
        }

        const sortedLogs = sortLogsByRecordedAt(categoryLogs);
        const latest = sortedLogs[0];
        const chartData = buildLogChartData(category.key, categoryLogs, period);
        const value = formatLogCategoryValue(category.key, categoryLogs);
        const meta = formatStatMeta(latest.recordedAt, categoryLogs.length);

        return {
            ...category,
            value: statPeriodRecord(value),
            meta: statPeriodRecord(meta),
            chartData,
            hasData: chartData.length > 0,
        };
    });
}

function buildDatedCountStatCategory(
    category: StatCategory,
    records: Array<{ timestamp: number }>,
    period: StatPeriod,
): StatCategory {
    const validRecords = records.filter((record) => Number.isFinite(record.timestamp));

    if (validRecords.length === 0) {
        return category;
    }

    const latest = [...validRecords].sort((a, b) => b.timestamp - a.timestamp)[0];
    const chartData = buildCountChartData(validRecords, period);
    const value = `${validRecords.length} 건`;
    const meta = formatStatMeta(new Date(latest.timestamp).toISOString(), validRecords.length);

    return {
        ...category,
        value: statPeriodRecord(value),
        meta: statPeriodRecord(meta),
        chartData,
        hasData: chartData.length > 0,
    };
}

function statPeriodRecord(value: string): Record<StatPeriod, string> {
    return {
        daily: value,
        weekly: value,
        monthly: value,
    };
}

function sortLogsByRecordedAt(logs: LogCard[]) {
    return [...logs].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
}

function formatLogCategoryValue(category: StatCategoryKey, logs: LogCard[]) {
    const sortedLogs = sortLogsByRecordedAt(logs);
    const latest = sortedLogs[0];

    switch (category) {
        case "feeding": {
            return summarizeFeedingLogs(logs)?.value ?? `${logs.length} 회`;
        }
        case "pumping": {
            const total = logs.reduce((sum, log) => sum + parseNumericValue(log.value), 0);
            return `${formatCompactNumber(total)} ml`;
        }
        case "sleep": {
            const totalMinutes = logs.reduce((sum, log) => sum + parseSleepMinutes(log), 0);
            return formatDurationMinutes(totalMinutes);
        }
        case "diaper":
        case "medicine":
            return `${logs.length} 회`;
        case "temperature":
            return latest?.value ?? "- ℃";
        case "growth":
            return `${logs.length} 건`;
        case "vaccination":
        case "hospital":
            return `${logs.length} 건`;
    }
}

function buildLogChartData(category: StatCategoryKey, logs: LogCard[], period: StatPeriod): StatChartPoint[] {
    const groups = new Map<string, { label: string; timestamp: number; total: number; count: number }>();
    const chartLogs = category === "feeding" ? (summarizeFeedingLogs(logs)?.logs ?? []) : logs;

    chartLogs.forEach((log) => {
        const timestamp = Date.parse(log.recordedAt);

        if (!Number.isFinite(timestamp)) {
            return;
        }

        const metric = chartMetricForLog(category, log);

        if (metric == null || metric <= 0) {
            return;
        }

        const bucket = chartBucket(new Date(timestamp), period);
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
            value: category === "temperature" ? Number((group.total / group.count).toFixed(1)) : Number(group.total.toFixed(1)),
        }));
}

function buildCountChartData(records: Array<{ timestamp: number }>, period: StatPeriod): StatChartPoint[] {
    const groups = new Map<string, { label: string; timestamp: number; total: number }>();

    records.forEach((record) => {
        const bucket = chartBucket(new Date(record.timestamp), period);
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

function chartMetricForLog(category: StatCategoryKey, log: LogCard) {
    switch (category) {
        case "feeding":
            return feedingMetricForLog(log)?.value ?? null;
        case "pumping":
        case "temperature":
            return parseNumericValue(log.value);
        case "sleep":
            return Number((parseSleepMinutes(log) / 60).toFixed(1));
        case "diaper":
        case "medicine":
        case "growth":
            return 1;
        case "vaccination":
        case "hospital":
            return null;
    }
}

function chartBucket(date: Date, period: StatPeriod) {
    if (period === "daily") {
        const bucketDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
        const hour = `${date.getHours()}`.padStart(2, "0");

        return {
            key: bucketDate.toISOString(),
            label: `${hour}시`,
            timestamp: bucketDate.getTime(),
        };
    }

    const bucketDate = startOfLocalDay(date);

    return {
        key: bucketDate.toISOString(),
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        timestamp: bucketDate.getTime(),
    };
}

function filterLogsForStats(recentLogs: LogCard[], period: StatPeriod, selectedDate: Date, selectedRange: DateRange) {
    if (period === "weekly") {
        const start = startOfLocalDay(selectedRange.startDate).getTime();
        const end = endOfLocalDay(selectedRange.endDate).getTime();

        return recentLogs.filter((log) => {
            const recordedAt = new Date(log.recordedAt).getTime();
            return recordedAt >= start && recordedAt <= end;
        });
    }

    if (period === "monthly") {
        return recentLogs.filter((log) => {
            const recordedAt = new Date(log.recordedAt);
            return recordedAt.getFullYear() === selectedDate.getFullYear() && recordedAt.getMonth() === selectedDate.getMonth();
        });
    }

    const selectedKey = localDateKey(selectedDate);
    return recentLogs.filter((log) => localDateKey(new Date(log.recordedAt)) === selectedKey);
}

function filterDatedRecordsForStats<T>(
    records: T[],
    period: StatPeriod,
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
            const start = startOfLocalDay(selectedRange.startDate).getTime();
            const end = endOfLocalDay(selectedRange.endDate).getTime();
            return timestamp >= start && timestamp <= end;
        }

        if (period === "monthly") {
            return recordDate.getFullYear() === selectedDate.getFullYear() && recordDate.getMonth() === selectedDate.getMonth();
        }

        return localDateKey(recordDate) === localDateKey(selectedDate);
    });
}

function startOfLocalDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function localDateKey(date: Date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function matchesStatCategory(category: StatCategoryKey, log: LogCard) {
    switch (category) {
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
            return log.type === "GROWTH";
        case "vaccination":
        case "hospital":
            return false;
    }
}

function parseNumericValue(value: string) {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseSleepMinutes(log: LogCard) {
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

    return parseNumericValue(log.value);
}

function formatDurationMinutes(totalMinutes: number) {
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

function formatCompactNumber(value: number) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function formatStatMeta(value: string, count: number) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return `${count}건 · 최신 기록`;
    }

    const formatted = new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);

    return `${count}건 · ${formatted} 최신 기록`;
}

function StandaloneShell({children}: { children: ReactNode }) {
    return (
        <View style={styles.appShell}>
            <View style={styles.phone}>{children}</View>
        </View>
    );
}

function blurActiveElement() {
    if (typeof document === "undefined") {
        return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
        activeElement.blur();
    }
}

function localDayRange(date: Date) {
    const start = startOfLocalDay(date);
    const end = endOfLocalDay(date);

    return {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
    };
}

export function RootRedirectRoute() {
    const router = useRouter();
    const app = useBabyBossAppContext();
    const nextRoute = app.session ? "/home" : "/login";

    useEffect(() => {
        if (app.isBooting) {
            return;
        }

        router.replace(nextRoute);
    }, [app.isBooting, nextRoute, router]);

    return null;
}

export function LoginRoute() {
    const router = useRouter();
    const app = useBabyBossAppContext();

    return (
        <StandaloneShell>
            <LoginScreen
                loginForm={app.loginForm}
                setLoginForm={app.setLoginForm}
                busyAction={app.busyAction}
                onLogin={() => void app.handleLogin()}
                onGoogleAuth={() => void app.handleGoogleAuth()}
                onSignup={() => router.push("/signup")}
            />
        </StandaloneShell>
    );
}

export function SignupRoute() {
    const app = useBabyBossAppContext();
    const params = useLocalSearchParams<{ invite_code?: string | string[] }>();
    const inviteCode = normalizeFamilyInviteCode(params.invite_code);

    useEffect(() => {
        if (!inviteCode) {
            return;
        }

        app.setJoinForm((current) => current.inviteCode === inviteCode ? current : {...current, inviteCode});
    }, [app.setJoinForm, inviteCode]);

    return (
        <StandaloneShell>
            <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}
                        showsVerticalScrollIndicator={false}>
                <AuthView
                    currentFamily={app.currentFamily}
                    currentChild={app.currentChild}
                    loginForm={app.loginForm}
                    setLoginForm={app.setLoginForm}
                    joinForm={app.joinForm}
                    setJoinForm={app.setJoinForm}
                    busyAction={app.busyAction}
                    onLogin={() => void app.handleLogin()}
                    onJoin={() => void app.handleJoin()}
                    onGoogleAuth={(inviteCode) => void app.handleGoogleAuth(inviteCode)}
                    initialMode="signup"
                />
            </ScrollView>
        </StandaloneShell>
    );
}

export function FamilyInviteLinkRoute() {
    const router = useRouter();
    const params = useLocalSearchParams<{ invite_code?: string | string[] }>();
    const inviteCode = normalizeFamilyInviteCode(params.invite_code);
    const [openMessage, setOpenMessage] = useState<string | null>(null);
    const appInviteLink = getFamilyInviteAppLink(inviteCode);
    const storeLinks = getFamilyInviteStoreLinks();

    useAppAlert(openMessage);

    useEffect(() => {
        if (Platform.OS === "web") {
            return;
        }

        router.replace(inviteCode ? {pathname: "/signup", params: {invite_code: inviteCode}} : "/signup");
    }, [inviteCode, router]);

    async function openLink(url: string) {
        try {
            await Linking.openURL(url);
        } catch {
            setOpenMessage("아이로그를 열지 못했어요. 앱을 설치한 뒤 다시 시도해 주세요.");
        }
    }

    if (Platform.OS !== "web") {
        return (
            <StandaloneShell>
                <View style={[styles.fullScreen, styles.inviteRedirecting]} testID="screen-family-invite-link">
                    <Text style={styles.inviteRedirectingText}>초대 정보를 불러오는 중이에요.</Text>
                </View>
            </StandaloneShell>
        );
    }

    return (
        <StandaloneShell>
            <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
                <View style={styles.inviteLanding} testID="screen-family-invite-link">
                    <View style={styles.inviteLandingIcon}>
                        <RecordIcon name="family-management" size={30} color={primary} strokeWidth={1.9}/>
                    </View>
                    <Text style={styles.inviteLandingTitle}>아이로그 가족 초대</Text>
                    <Text style={styles.inviteLandingBody}>
                        {inviteCode ? "아이로그 앱에서 열면 가족 코드가 자동으로 적용됩니다." : "초대 링크에 가족 코드가 없어요."}
                    </Text>
                    {inviteCode ? (
                        <>
                            <Pressable style={styles.primaryButton} onPress={() => void openLink(appInviteLink)} accessibilityRole="button" testID="family-invite-open-app">
                                <Text style={styles.primaryButtonText}>앱에서 열기</Text>
                            </Pressable>
                            <View style={styles.inviteCodeCard}>
                                <Text style={styles.inviteCodeCardLabel}>가족 초대 코드</Text>
                                <Text style={styles.inviteCodeCardValue} selectable testID="family-invite-link-code">{inviteCode}</Text>
                            </View>
                            {storeLinks.ios || storeLinks.android ? (
                                <View style={styles.inviteStoreRow}>
                                    {storeLinks.ios ? (
                                        <Pressable style={styles.inviteStoreButton} onPress={() => void openLink(storeLinks.ios)} accessibilityRole="link" testID="family-invite-app-store">
                                            <Text style={styles.inviteStoreButtonText}>App Store</Text>
                                        </Pressable>
                                    ) : null}
                                    {storeLinks.android ? (
                                        <Pressable style={styles.inviteStoreButton} onPress={() => void openLink(storeLinks.android)} accessibilityRole="link" testID="family-invite-play-store">
                                            <Text style={styles.inviteStoreButtonText}>Google Play</Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                            ) : null}
                        </>
                    ) : null}
                </View>
            </ScrollView>
        </StandaloneShell>
    );
}

export function FamilyRoute() {
    const app = useBabyBossAppContext();

    return (
        <StandaloneShell>
            <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}
                        showsVerticalScrollIndicator={false}>
                <AuthView
                    currentFamily={app.currentFamily}
                    currentChild={app.currentChild}
                    loginForm={app.loginForm}
                    setLoginForm={app.setLoginForm}
                    joinForm={app.joinForm}
                    setJoinForm={app.setJoinForm}
                    busyAction={app.busyAction}
                    onLogin={() => void app.handleLogin()}
                    onJoin={() => void app.handleJoin()}
                    onGoogleAuth={(inviteCode) => void app.handleGoogleAuth(inviteCode)}
                    initialMode="family"
                />
            </ScrollView>
        </StandaloneShell>
    );
}

export function GoogleAuthCallbackRoute() {
    const router = useRouter();
    const app = useBabyBossAppContext();
    const [handled, setHandled] = useState(false);

    useEffect(() => {
        if (handled) {
            return;
        }

        setHandled(true);
        void app.handleGoogleAuthCallback();
    }, [app, handled]);

    useEffect(() => {
        if (!app.session) {
            return;
        }

        router.replace(app.session.child ? "/home" : "/auth/callback");
    }, [app.session, router]);

    return (
        <StandaloneShell>
            <View style={styles.fullScreen} testID="screen-google-auth-callback">
                <View style={styles.formScreen}>
                    <Text style={styles.authTitle}>Google 로그인</Text>
                    <Text style={styles.authSubtitle}>계정 정보를 확인하고 있어요.</Text>
                    {app.error ? (
                        <Pressable style={styles.primaryButton} onPress={() => router.replace("/login")} testID="google-auth-back-login">
                            <Text style={styles.primaryButtonText}>로그인으로 돌아가기</Text>
                        </Pressable>
                    ) : null}
                </View>
            </View>
        </StandaloneShell>
    );
}

export function QuickAddRoute() {
    const router = useRouter();

    return (
        <StandaloneShell>
            <QuickAddScreen
                onCancel={() => router.replace("/home")}
                onSelectRecord={(route) => router.push(route)}
                onPhotoUploaded={() => router.replace("/photo-album")}
            />
        </StandaloneShell>
    );
}

export function LogDetailRoute() {
    const router = useRouter();

    return (
        <StandaloneShell>
            <LogDetailScreen onBack={() => router.replace("/timeline")}/>
        </StandaloneShell>
    );
}

export function RoutedTabShell() {
    const router = useRouter();
    const pathname = usePathname();
    const active = resolveActiveTab(pathname);
    const bottomOffset = resolveBottomTabBarOffset(Platform.OS);
    const familyChatBottom = pathname === "/timeline"
        ? resolveTimelineFamilyChatBottom(TIMELINE_COMPOSER_RESTING_BOTTOM)
        : bottomOffset + 88;

    return (
        <View style={styles.appShell}>
            <View style={styles.phone}>
                <View style={styles.contentArea}>
                    <Slot/>
                </View>
                <BottomTabBar
                    active={active}
                    bottomOffset={bottomOffset}
                    mutedPlus={pathname === "/notifications"}
                    onTab={(nextTab) => {
                        blurActiveElement();
                        router.replace(tabRoutes[nextTab]);
                    }}
                    onQuickAdd={() => {
                        blurActiveElement();
                        router.push("/quick-add");
                    }}
                />
                <Pressable
                    style={[styles.familyChatFab, {bottom: familyChatBottom}]}
                    onPress={() => {
                        blurActiveElement();
                        router.push("/family-chat");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="가족 대화 열기"
                    testID="open-family-chat">
                    <RecordIcon name="chat" size={23} color="#16877D" strokeWidth={2.2}/>
                </Pressable>
            </View>
        </View>
    );
}

export function DashboardRoute() {
    const router = useRouter();
    const app = useBabyBossAppContext();
    const familyId = app.session?.family.id ?? null;
    const recentPhotos = familyId == null
        ? null
        : getCachedPhotoAlbum(familyId) ?? app.dashboard?.recentPhotos ?? null;

    return (
        <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}
                    showsVerticalScrollIndicator={false} testID="screen-dashboard">
            <DashboardView
                dashboard={app.dashboard}
                session={app.session}
                caregivers={app.settings?.caregivers ?? app.bootstrap?.caregivers ?? []}
                recentPhotos={recentPhotos}
                taskForm={app.taskForm}
                setTaskForm={app.setTaskForm}
                busyAction={app.busyAction}
                onTask={() => app.handleTask()}
                onComplete={(taskId) => void app.handleComplete(taskId)}
                onOpenChat={() => router.push("/timeline")}
                onOpenNotebook={() => router.push("/statistics")}
                onOpenTaskList={() => router.push("/task-assignments")}
                onOpenPhotoAlbum={() => router.push("/photo-album")}
                onOpenAlerts={() => router.push("/notifications")}
                onOpenSettings={() => router.push("/settings")}
            />
        </ScrollView>
    );
}

export function TaskAssignmentsRoute() {
    const router = useRouter();
    const app = useBabyBossAppContext();
    const familyId = app.session?.family.id ?? null;
    const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
    const [tasks, setTasks] = useState<TaskCard[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isTaskModalOpen, setTaskModalOpen] = useState(false);
    const caregivers = app.settings?.caregivers ?? app.bootstrap?.caregivers ?? [];

    const loadTasks = useCallback(async () => {
        if (!familyId) {
            setTasks([]);
            setIsLoading(false);
            return;
        }

        const {startAt, endAt} = localDayRange(selectedDate);

        setIsLoading(true);
        setError(null);
        try {
            setTasks(await fetchTasks(familyId, {startAt, endAt}));
        } catch (loadError) {
            setTasks([]);
            setError(loadError instanceof Error ? loadError.message : "분담 목록을 불러오지 못했어요.");
        } finally {
            setIsLoading(false);
        }
    }, [familyId, selectedDate]);

    useEffect(() => {
        void loadTasks();
    }, [loadTasks]);

    async function handleComplete(taskId: number) {
        await app.handleComplete(taskId);
        await loadTasks();
    }

    async function handleTask() {
        const saved = await app.handleTask();
        if (saved) {
            await loadTasks();
        }
        return saved;
    }

    return (
        <StandaloneShell>
            <ScrollView style={styles.mainScroll} contentContainerStyle={styles.taskAssignmentsContent} showsVerticalScrollIndicator={false}>
                <TaskListView
                    selectedDate={selectedDate}
                    tasks={tasks}
                    isLoading={isLoading}
                    error={error}
                    busyAction={app.busyAction}
                    onBack={() => router.replace("/home")}
                    onAdd={() => setTaskModalOpen(true)}
                    onDateChange={(date) => setSelectedDate(startOfLocalDay(date))}
                    onComplete={(taskId) => void handleComplete(taskId)}
                />
            </ScrollView>
            <TaskRegistrationModal
                visible={isTaskModalOpen}
                taskForm={app.taskForm}
                setTaskForm={app.setTaskForm}
                caregivers={caregivers}
                busyAction={app.busyAction}
                onClose={() => setTaskModalOpen(false)}
                onTask={handleTask}
            />
        </StandaloneShell>
    );
}

export function TimelineRoute() {
    const app = useBabyBossAppContext();
    const chatBusy = app.busyAction === "chat";
    const canSubmitMemo = Boolean(app.chatBody.trim()) && !chatBusy;
    const {bottom: bottomSafeAreaInset} = useSafeAreaInsets();
    const keyboardInset = useKeyboardInset();
    const composerBottom = resolveTimelineComposerBottom({keyboardInset, bottomSafeAreaInset});

    return (
        <View style={styles.routeFrame}>
            <ScrollView
                style={styles.mainScroll}
                contentContainerStyle={[
                    styles.mainContent,
                    styles.timelineWithComposerContent,
                    {paddingBottom: timelineComposerContentPaddingBottom(composerBottom)},
                ]}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                testID="screen-timeline">
                <ChatView
                    chat={app.chat}
                    timelineDate={app.timelineDate}
                    busyAction={app.busyAction}
                    onComment={(messageId, body, parentCommentId) => void app.handleTimelineComment(messageId, body, parentCommentId)}
                    onTimelineDateChange={(date) => void app.changeTimelineDate(date)}
                />
            </ScrollView>
            <View style={[styles.timelineMemoComposer, {bottom: composerBottom}]} testID="timeline-compose-panel">
                <TextInput
                    value={app.chatBody}
                    onChangeText={app.setChatBody}
                    placeholder="메모 추가"
                    placeholderTextColor="#94A3B8"
                    multiline
                    style={styles.timelineMemoInput}
                    testID="timeline-compose-input"
                />
                <Pressable
                    style={[styles.timelineMemoSubmit, !canSubmitMemo && styles.timelineMemoSubmitDisabled]}
                    onPress={() => {
                        blurActiveElement();
                        void app.handleChat();
                    }}
                    disabled={!canSubmitMemo}
                    accessibilityRole="button"
                    testID="timeline-compose-submit">
                    <Text style={styles.timelineMemoSubmitText}>{chatBusy ? "저장 중" : "등록"}</Text>
                </Pressable>
            </View>
        </View>
    );
}

export function StatisticsRoute() {
    const router = useRouter();
    const app = useBabyBossAppContext();
    const familyId = app.session?.family.id ?? null;
    const [period, setPeriod] = useState<StatPeriod>("daily");
    const [selectedDate, setSelectedDate] = useState(defaultStatsDate);
    const [selectedRange, setSelectedRange] = useState<DateRange>(() => ({
        startDate: startOfWeek(defaultStatsDate),
        endDate: endOfWeek(defaultStatsDate),
    }));
    const [displayMonth, setDisplayMonth] = useState(defaultStatsDate);
    const [activeCategory, setActiveCategory] = useState<StatCategoryKey>("feeding");
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [statsLogs, setStatsLogs] = useState<LogCard[] | null>(null);
    const [statsVaccinations, setStatsVaccinations] = useState<VaccinationCard[] | null>(null);
    const [statsHospitalVisits, setStatsHospitalVisits] = useState<HospitalVisitCard[] | null>(null);
    const [statsLoadError, setStatsLoadError] = useState<string | null>(null);
    const rangeLabel = period === "weekly"
        ? formatDateRangeLabel(selectedRange.startDate, selectedRange.endDate)
        : formatStatsRangeLabel(period, selectedDate);
    const statLogSource = statsLogs ?? app.dashboard?.recentLogs ?? [];

    useAppAlert(statsLoadError);

    useEffect(() => {
        let isActive = true;

        if (!familyId) {
            setStatsLogs(null);
            setStatsVaccinations(null);
            setStatsHospitalVisits(null);
            setStatsLoadError(null);
            return undefined;
        }

        setStatsLoadError(null);

        Promise.all([
            fetchLogs(familyId, {limit: 120}),
            fetchVaccinations(familyId),
            fetchHospitalVisits(familyId),
        ])
            .then(([logs, vaccinations, hospitalVisits]) => {
                if (!isActive) {
                    return;
                }

                setStatsLogs(logs);
                setStatsVaccinations(vaccinations);
                setStatsHospitalVisits(hospitalVisits);
            })
            .catch((error) => {
                if (!isActive) {
                    return;
                }

                setStatsLoadError(error instanceof Error ? error.message : "통계 데이터를 불러오지 못했어요.");
            });

        return () => {
            isActive = false;
        };
    }, [familyId, app.dashboard?.generatedAt]);

    const filteredStatLogs = useMemo(
        () => filterLogsForStats(statLogSource, period, selectedDate, selectedRange),
        [statLogSource, period, selectedDate, selectedRange],
    );
    const filteredStatVaccinations = useMemo(
        () =>
            filterDatedRecordsForStats(
                statsVaccinations ?? [],
                period,
                selectedDate,
                selectedRange,
                (record) => record.completedAt ?? record.dueAt,
            ),
        [statsVaccinations, period, selectedDate, selectedRange],
    );
    const filteredStatHospitalVisits = useMemo(
        () => filterDatedRecordsForStats(statsHospitalVisits ?? [], period, selectedDate, selectedRange, (record) => record.visitedAt),
        [statsHospitalVisits, period, selectedDate, selectedRange],
    );
    const apiStatCategories = useMemo(
        () =>
            buildApiStatCategories({
                logs: filteredStatLogs,
                vaccinations: filteredStatVaccinations,
                hospitalVisits: filteredStatHospitalVisits,
                period,
            }),
        [filteredStatLogs, filteredStatVaccinations, filteredStatHospitalVisits, period],
    );
    const updatePeriod = (nextPeriod: StatPeriod) => {
        setPeriod(nextPeriod);
        setDatePickerOpen(false);
    };
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
        <StatisticsScreen
            period={period}
            rangeLabel={rangeLabel}
            selectedDate={selectedDate}
            selectedRange={selectedRange}
            displayMonth={displayMonth}
            datePickerOpen={datePickerOpen}
            statsLoadError={statsLoadError}
            activeCategory={activeCategory}
            categories={apiStatCategories}
            onPeriodChange={updatePeriod}
            onPreviousRange={() => moveRange(-1)}
            onNextRange={() => moveRange(1)}
            onToggleDatePicker={() => setDatePickerOpen((current) => !current)}
            onCloseDatePicker={() => setDatePickerOpen(false)}
            onDisplayMonthChange={setDisplayMonth}
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
            onSelectCategory={setActiveCategory}
            onOpenCategory={(route) => router.push(route)}
        />
    );
}

export function GrowthRoute() {
    const router = useRouter();
    const app = useBabyBossAppContext();
    const familyId = app.session?.family.id ?? null;
    const [measurements, setMeasurements] = useState<GrowthMeasurementCard[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useAppAlert(error);

    useEffect(() => {
        let isActive = true;

        if (!familyId) {
            setMeasurements([]);
            setError(null);
            setIsLoading(false);
            return () => {
                isActive = false;
            };
        }

        setIsLoading(true);
        fetchGrowthMeasurements(familyId)
            .then((rows) => {
                if (isActive) {
                    setMeasurements(rows);
                    setError(null);
                }
            })
            .catch((fetchError) => {
                if (isActive) {
                    setMeasurements([]);
                    setError(fetchError instanceof Error ? fetchError.message : "성장 기록을 불러오지 못했어요.");
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
    }, [familyId]);

    return (
        <GrowthScreen
            measurements={measurements}
            isLoading={isLoading}
            onBack={() => router.replace("/statistics")}
            onAdd={() => router.push("/growth-add")}
            onOpenDetail={() => router.push("/growth-detail")}
        />
    );
}

export function NotificationsRoute() {
    const router = useRouter();
    const app = useBabyBossAppContext();

    return (
        <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}
                    showsVerticalScrollIndicator={false}>
            <AlertsView dashboard={app.dashboard} onClose={() => router.replace("/home")}/>
        </ScrollView>
    );
}

export function SettingsRoute() {
    const router = useRouter();
    const app = useBabyBossAppContext();

    return (
        <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}
                    showsVerticalScrollIndicator={false} testID="screen-settings">
            <SettingsView
                settings={app.settings}
                currentSettings={app.currentSettings}
                session={app.session}
                busyAction={app.busyAction}
                onSettingsUpdate={(patch) => void app.handleSettingsUpdate(patch)}
                onProfileUpdate={(payload) => void app.handleCaregiverProfileUpdate(payload)}
                onLogout={() => void app.handleLogout()}
                onNavigate={(route) => router.push(route)}
            />
        </ScrollView>
    );
}

export function NotFoundRoute() {
    return (
        <StandaloneShell>
            <View style={styles.notFound}>
                <Text style={styles.notFoundTitle}>페이지를 찾을 수 없어요</Text>
                <Link href="/home" asChild>
                    <Pressable style={styles.primaryButton}>
                        <Text style={styles.primaryButtonText}>홈으로 이동</Text>
                    </Pressable>
                </Link>
            </View>
        </StandaloneShell>
    );
}

function resolveActiveTab(pathname: string): BottomTab {
    if (pathname === "/timeline") {
        return "timeline";
    }
    if (pathname === "/statistics" || pathname === "/growth") {
        return "statistics";
    }
    if (pathname === "/settings" || pathname === "/notifications") {
        return "settings";
    }
    return "dashboard";
}

type LoginFormValue = {
    email: string;
    password: string;
};

function LoginScreen({
                         loginForm,
                         setLoginForm,
                         busyAction,
                         onLogin,
                         onGoogleAuth,
                         onSignup,
}: {
    loginForm: LoginFormValue;
    setLoginForm: Dispatch<SetStateAction<LoginFormValue>>;
    busyAction: string | null;
    onLogin: () => void;
    onGoogleAuth: () => void;
    onSignup: () => void;
}) {
    return (
        <View style={styles.fullScreen} testID="screen-login">
            <View style={styles.formScreen}>
                <View style={styles.authLogoWrap}>
                    <Image
                        source={authBrandLogo}
                        style={styles.authLogo}
                        resizeMode="contain"
                        accessibilityLabel="아이로그"
                        testID="login-brand-logo"
                    />
                </View>

                <InputBox
                    placeholder="이메일"
                    value={loginForm.email}
                    onChangeText={(email) => setLoginForm((current) => ({...current, email}))}
                    keyboardType="email-address"
                    testID="auth-login-email"
                />
                <InputBox
                    placeholder="비밀번호"
                    value={loginForm.password}
                    secure
                    right="⊙"
                    onChangeText={(password) => setLoginForm((current) => ({...current, password}))}
                    testID="auth-login-password"
                />

                <View style={styles.keepLoginRow}>
                    <View style={styles.checkedBox}>
                        <Text style={styles.checkedMark}>✓</Text>
                    </View>
                    <Text style={styles.keepLoginText}>로그인 상태 유지</Text>
                </View>

                <Pressable style={styles.primaryButton} onPress={onLogin} testID="login-submit">
                    <Text style={styles.primaryButtonText}>{busyAction === "login" ? "로그인 중..." : "로그인"}</Text>
                </Pressable>
                <Text style={styles.linkCenter}>비밀번호 찾기</Text>

                <View style={styles.orRow}>
                    <View style={styles.orLine}/>
                    <Text style={styles.orText}>또는</Text>
                    <View style={styles.orLine}/>
                </View>

                <SocialButton
                    provider="google"
                    label={busyAction === "google-auth" ? "Google로 이동 중..." : "Sign in with Google"}
                    onPress={onGoogleAuth}
                    disabled={busyAction === "google-auth"}
                />
                <SocialButton provider="apple" label="Sign in with Apple"/>

                <Pressable style={styles.signupLinkRow} onPress={onSignup} testID="go-signup">
                    <Text style={styles.signupQuestion}>계정이 없으신가요?</Text>
                    <Text style={styles.signupLink}>회원가입</Text>
                </Pressable>
                <View style={styles.authLegalLinks}>
                    <Link href="/terms" asChild>
                        <Pressable accessibilityRole="link">
                            <Text style={styles.authLegalLinkText}>이용약관</Text>
                        </Pressable>
                    </Link>
                    <Text style={styles.authLegalSeparator}>·</Text>
                    <Link href="/privacy-policy" asChild>
                        <Pressable accessibilityRole="link">
                            <Text style={styles.authLegalLinkText}>개인정보 처리방침</Text>
                        </Pressable>
                    </Link>
                </View>
            </View>
        </View>
    );
}

function QuickAddScreen({onCancel, onSelectRecord, onPhotoUploaded}: {
    onCancel: () => void;
    onSelectRecord: (route: RecordAddRoute) => void;
    onPhotoUploaded: () => void;
}) {
    const app = useBabyBossAppContext();
    const [photoSourceVisible, setPhotoSourceVisible] = useState(false);
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoMessage, setPhotoMessage] = useState<string | null>(null);

    async function addPhoto(source: FamilyPhotoPickerSource) {
        if (photoUploading) {
            return;
        }

        setPhotoSourceVisible(false);
        setPhotoMessage(null);

        try {
            const assets = await pickFamilyPhotoAssets(source);

            if (assets.length === 0) {
                return;
            }

            setPhotoUploading(true);
            setPhotoMessage(assets.length === 1 ? "사진을 앨범에 저장하는 중이에요." : `사진 ${assets.length}장을 앨범에 저장하는 중이에요.`);
            const session = app.session ?? (await restoreSession());
            const {uploadedPhotos, failedMessages} = await uploadFamilyPhotoAssets(session.family.id, assets);

            if (uploadedPhotos.length > 0) {
                onPhotoUploaded();
                return;
            }

            setPhotoMessage(null);
            showAppAlert(failedMessages[0] ?? "사진을 업로드하지 못했어요.");
        } catch (error) {
            setPhotoMessage(null);
            showAppAlert(error instanceof Error ? error.message : "사진을 업로드하지 못했어요.");
        } finally {
            setPhotoUploading(false);
        }
    }

    return (
        <View style={styles.fullScreen} testID="screen-quick-add">
            <View style={styles.navHeader}>
                <View style={styles.navSide}/>
                <Text style={styles.navTitle}>기록 추가</Text>
                <Pressable onPress={onCancel} testID="quick-cancel">
                    <Text style={styles.navAction}>취소</Text>
                </Pressable>
            </View>
            <ScrollView
                contentContainerStyle={styles.quickGrid}
                showsVerticalScrollIndicator={false}
                testID="quick-add-grid">
                <QuickChoice icon="feeding" label="맘마" testID="quick-feeding" onPress={() => onSelectRecord(recordAddRoutes.feeding)}/>
                <QuickChoice icon="sleep" label="잠" onPress={() => onSelectRecord(recordAddRoutes.sleep)}/>
                <QuickChoice icon="diaper" label="기저귀" onPress={() => onSelectRecord(recordAddRoutes.diaper)}/>
                <QuickChoice icon="temperature" label="체온" onPress={() => onSelectRecord(recordAddRoutes.temperature)}/>
                <QuickChoice icon="medicine" label="약/영양제" onPress={() => onSelectRecord(recordAddRoutes.medicine)}/>
                <QuickChoice icon="pumping" label="유축" onPress={() => onSelectRecord(recordAddRoutes.pumping)}/>
                <QuickChoice icon="growth" label="성장" onPress={() => onSelectRecord(recordAddRoutes.growth)}/>
                <QuickChoice icon="vaccine" label="예방접종" onPress={() => onSelectRecord(recordAddRoutes.vaccination)}/>
                <QuickChoice icon="hospital" label="병원 방문" onPress={() => onSelectRecord(recordAddRoutes.hospital)}/>
                <QuickChoice icon="memo" label="메모" onPress={() => onSelectRecord(recordAddRoutes.memo)}/>
                <QuickChoice
                    icon="photo"
                    label={photoUploading ? "저장 중" : "사진"}
                    onPress={() => setPhotoSourceVisible(true)}
                    disabled={photoUploading}
                    testID="quick-photo"
                />
                {photoMessage ? <Text style={styles.quickPhotoMessage}>{photoMessage}</Text> : null}
            </ScrollView>
            <FamilyPhotoSourceModal
                visible={photoSourceVisible}
                busy={photoUploading}
                onClose={() => setPhotoSourceVisible(false)}
                onCamera={() => void addPhoto("camera")}
                onLibrary={() => void addPhoto("library")}
                testID="quick-photo-source"
            />
        </View>
    );
}

function LogDetailScreen({onBack}: { onBack: () => void }) {
    return (
        <View style={styles.fullScreen} testID="screen-log-detail">
            <View style={styles.navHeader}>
                <Pressable onPress={onBack} testID="detail-back">
                    <RecordIcon name="back-arrow" size={24}/>
                </Pressable>
                <Text style={styles.navTitle}>기록 상세</Text>
                <View style={styles.navSide}/>
            </View>
            <View style={styles.detailContent}>
                <View style={styles.logDetailEmpty}>
                    <Text style={styles.logDetailEmptyTitle}>선택된 기록이 없어요</Text>
                    <Text style={styles.logDetailEmptyDescription}>타임라인에서 기록을 선택하면 상세 내용을 확인할 수 있어요.</Text>
                </View>
            </View>
        </View>
    );
}

function StatisticsScreen({
                              period,
                              rangeLabel,
                              selectedDate,
                              selectedRange,
                              displayMonth,
                              datePickerOpen,
                              statsLoadError,
                              activeCategory,
                              categories,
                              onPeriodChange,
                              onPreviousRange,
                              onNextRange,
                              onToggleDatePicker,
                              onCloseDatePicker,
                              onDisplayMonthChange,
                              onSelectDate,
                              onSelectRange,
                              onSelectCategory,
                              onOpenCategory,
                          }: {
    period: StatPeriod;
    rangeLabel: string;
    selectedDate: Date;
    selectedRange: DateRange;
    displayMonth: Date;
    datePickerOpen: boolean;
    statsLoadError: string | null;
    activeCategory: StatCategoryKey;
    categories: StatCategory[];
    onPeriodChange: (period: StatPeriod) => void;
    onPreviousRange: () => void;
    onNextRange: () => void;
    onToggleDatePicker: () => void;
    onCloseDatePicker: () => void;
    onDisplayMonthChange: (date: Date) => void;
    onSelectDate: (date: Date) => void;
    onSelectRange: (range: DateRange) => void;
    onSelectCategory: (category: StatCategoryKey) => void;
    onOpenCategory: (route: string) => void;
}) {
    const active = categories.find((category) => category.key === activeCategory) ?? categories[0];

    return (
        <View style={styles.routeFrame}>
            <ScrollView style={styles.mainScroll} contentContainerStyle={styles.statsContent}
                        showsVerticalScrollIndicator={false} testID="screen-statistics">
                <View style={styles.segmented}>
                    {statPeriods.map((item) => (
                        <Segment key={item.key} label={item.label} active={period === item.key}
                                 onPress={() => onPeriodChange(item.key)}/>
                    ))}
                </View>
                <View style={styles.dateControl}>
                    <Pressable style={styles.dateButton} onPress={onPreviousRange} testID="stats-prev-range">
                        <RecordIcon name="back-arrow" size={22}/>
                    </Pressable>
                    <Pressable
                        style={[styles.rangePickerButton, datePickerOpen && styles.rangePickerButtonActive]}
                        onPress={onToggleDatePicker}
                        accessibilityRole="button"
                        testID="stats-date-picker-open">
                        <Text style={styles.rangeText}>{rangeLabel}</Text>
                        <RecordIcon name="calendar" size={15} color={primary} strokeWidth={2.1}/>
                    </Pressable>
                    <Pressable style={styles.dateButton} onPress={onNextRange} testID="stats-next-range">
                        <RecordIcon name="next-arrow" size={22}/>
                    </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.statsCategoryScroll}>
                    {categories.map((category) => (
                        <Pressable key={category.key}
                                   style={[styles.statsCategoryChip, activeCategory === category.key && styles.statsCategoryChipActive]}
                                   onPress={() => onSelectCategory(category.key)}
                                   testID={`stats-category-${category.key}`}>
                            <RecordIcon name={category.icon} size={20}/>
                            <Text
                                style={[styles.statsCategoryChipText, activeCategory === category.key && styles.statsCategoryChipTextActive]}>
                                {category.label}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>
                <ChartCard title={`${active.label} 통계`} meta={active.meta[period]} type={active.chart} hasData={active.hasData}
                           chartData={active.chartData}
                           onPress={() => onOpenCategory(active.route)}/>
                <View style={styles.statsSummaryCard}>
                    <View style={styles.statsSummaryIcon}>
                        <RecordIcon name={active.icon} size={30}/>
                    </View>
                    <View style={styles.statsSummaryCopy}>
                        <Text style={styles.statsSummaryLabel}>{active.label}</Text>
                        <Text style={styles.statsSummaryValue}>{active.value[period]}</Text>
                        <Text style={styles.statsSummaryMeta}>{active.meta[period]}</Text>
                    </View>
                    <Pressable style={styles.statsSummaryAction} onPress={() => onOpenCategory(active.route)}>
                        <Text style={styles.statsSummaryActionText}>상세</Text>
                    </Pressable>
                </View>
                <Text style={styles.statsSectionTitle}>카테고리별 통계</Text>
                <View style={styles.statsCategoryGrid}>
                    {categories.map((category) => (
                        <Pressable key={category.key}
                                   style={[styles.statsCategoryCard, activeCategory === category.key && styles.statsCategoryCardActive]}
                                   onPress={() => {
                                       onSelectCategory(category.key);
                                       onOpenCategory(category.route);
                                   }}
                                   testID={`stats-open-${category.key}`}>
                            <RecordIcon name={category.icon} size={24}/>
                            <Text style={styles.statsCategoryLabel}>{category.label}</Text>
                            <Text style={styles.statsCategoryValue}>{category.value[period]}</Text>
                        </Pressable>
                    ))}
                </View>
            </ScrollView>
            <CalendarDatePickerOverlay
                visible={datePickerOpen}
                selectedDate={selectedDate}
                displayMonth={displayMonth}
                mode={period === "monthly" ? "month" : "date"}
                selectionMode={period === "weekly" ? "week" : "single"}
                selectedRange={selectedRange}
                title={period === "monthly" ? "월 선택" : period === "weekly" ? "주간 선택" : "날짜 선택"}
                testID="stats-date-picker"
                onClose={onCloseDatePicker}
                onSelectDate={onSelectDate}
                onSelectRange={onSelectRange}
                onDisplayMonthChange={onDisplayMonthChange}
            />
        </View>
    );
}

function GrowthScreen({measurements, isLoading, onBack, onAdd, onOpenDetail}: {
    measurements: GrowthMeasurementCard[];
    isLoading: boolean;
    onBack: () => void;
    onAdd: () => void;
    onOpenDetail: () => void
}) {
    const latest = measurements[0] ?? null;
    const hasWeightRecords = measurements.some((measurement) => measurement.weightKg != null);

    return (
        <View style={styles.fullScreen} testID="screen-growth">
            <View style={styles.growthTopTabs}>
                <GrowthTab label="키"/>
                <GrowthTab label="몸무게" active/>
                <GrowthTab label="머리둘레"/>
            </View>
            <View style={styles.growthContent}>
                <Pressable onPress={onBack} testID="growth-back">
                    <RecordIcon name="back-arrow" size={24}/>
                </Pressable>
                <View style={styles.growthHeader}>
                    <Text style={styles.growthWeight}>{isLoading ? "불러오는 중..." : formatGrowthWeight(latest)}</Text>
                    <Text style={styles.growthRank}>{latest ? formatGrowthLatestMeta(latest, measurements.length) : "기록 없음"}</Text>
                </View>
                {hasWeightRecords ? (
                    <Pressable onPress={onOpenDetail}>
                        <GrowthChart measurements={measurements}/>
                    </Pressable>
                ) : (
                    <View style={styles.growthEmptyState}>
                        <Text style={styles.growthEmptyTitle}>아직 성장 기록이 없어요</Text>
                        <Text style={styles.growthEmptyDescription}>키, 몸무게, 머리둘레를 기록하면 성장 추이가 표시됩니다.</Text>
                    </View>
                )}
                {hasWeightRecords ? <Text style={styles.growthNote}>등록된 몸무게 기록 기준</Text> : null}
                <Pressable style={styles.growthAddButton} onPress={onAdd} testID="growth-add">
                    <Text style={styles.growthAddText}>＋ 기록 추가</Text>
                </Pressable>
            </View>
        </View>
    );
}

function BottomTabBar({
                          active,
                          bottomOffset,
                          onTab,
                          onQuickAdd,
                          mutedPlus,
                      }: {
    active: BottomTab;
    bottomOffset: number;
    onTab: (tab: BottomTab) => void;
    onQuickAdd: () => void;
    mutedPlus?: boolean;
}) {
    return (
        <View style={[styles.tabBar, {bottom: bottomOffset}]} testID="bottom-tab-bar">
            <TabButton active={active === "dashboard"} icon="home" label="홈" onPress={() => onTab("dashboard")}/>
            <TabButton active={active === "timeline"} icon="record" label="기록" onPress={() => onTab("timeline")}/>
            <Pressable style={styles.plusTab} onPress={onQuickAdd} testID="bottom-plus">
                <View style={[styles.plusButton, mutedPlus && styles.plusButtonMuted]} testID="bottom-plus-button">
                    <RecordIcon name="add-plus" size={25} color={bg} strokeWidth={2.2}/>
                </View>
            </Pressable>
            <TabButton active={active === "statistics"} icon="stats" label="통계" onPress={() => onTab("statistics")}/>
            <TabButton active={active === "settings"} icon="more" label="더보기" onPress={() => onTab("settings")}/>
        </View>
    );
}

function TabButton({
                       active,
                       icon,
                       label,
                       onPress,
                   }: {
    active: boolean;
    icon: TabGlyphName;
    label: string;
    onPress: () => void;
}) {
    const iconColor = active ? primary : "#4B5563";

    return (
        <Pressable style={styles.tabItem} onPress={onPress} testID={`tab-${label}`}>
            <RecordIcon name={icon} size={22} color={iconColor} strokeWidth={active ? 2.2 : 1.9}/>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
        </Pressable>
    );
}

function InputBox({placeholder, value, secure, right, keyboardType, maxLength, onChangeText, testID}: {
    placeholder: string;
    value?: string;
    secure?: boolean;
    right?: string;
    keyboardType?: KeyboardTypeOptions;
    maxLength?: number;
    onChangeText?: (value: string) => void;
    testID?: string;
}) {
    return (
        <View style={styles.inputWrap}>
            <TextInput
                style={styles.input}
                placeholder={placeholder}
                value={value}
                placeholderTextColor="#AEB7C5"
                secureTextEntry={secure}
                keyboardType={keyboardType}
                maxLength={maxLength}
                onChangeText={onChangeText}
                testID={testID}
            />
            {right ? (
                <Text style={styles.inputRight}>
                    {right}
                </Text>
            ) : null}
        </View>
    );
}

function SocialButton({
                          provider,
                          label,
                          onPress,
                          disabled,
                      }: {
    provider: "google" | "apple";
    label: string;
    onPress?: () => void;
    disabled?: boolean;
}) {
    if (provider === "google") {
        return <GoogleSignInButton label={label} onPress={onPress} disabled={disabled} style={styles.googleSignInButton} testID="provider-google-auth"/>;
    }

    return <AppleSignInButton label={label} onPress={onPress} disabled={disabled} style={styles.appleSignInButton} testID="provider-apple-auth"/>;
}

function QuickChoice({icon, label, onPress, disabled = false, testID}: {
    icon: RecordIconName;
    label: string;
    onPress?: () => void;
    disabled?: boolean;
    testID?: string;
}) {
    return (
        <Pressable
            style={[styles.quickChoice, disabled && styles.quickChoiceDisabled]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{disabled}}
            testID={testID}>
            <View style={[styles.quickIconCircle, disabled && styles.quickIconCircleDisabled]}>
                <RecordIcon name={icon} size={42}/>
            </View>
            <Text style={styles.quickLabel}>{label}</Text>
        </Pressable>
    );
}

function Segment({label, active, onPress}: { label: string; active: boolean; onPress: () => void }) {
    return (
        <Pressable style={[styles.segment, active && styles.segmentActive]} onPress={onPress}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
        </Pressable>
    );
}

function ChartCard({title, meta, type, hasData, chartData, onPress}: {
    title: string;
    meta: string;
    type: "bar" | "line";
    hasData: boolean;
    chartData: StatChartPoint[];
    onPress?: () => void
}) {
    const {width} = useWindowDimensions();
    const chartWidth = Math.min(width - horizontalGutter * 2 - 44, 300);
    const visibleChartData = chartData.slice(-7);

    return (
        <Pressable style={styles.chartCard} onPress={onPress}>
            <View style={styles.rowBetween}>
                <Text style={styles.chartTitle}>{title}</Text>
                <Text style={styles.chartMeta}>{meta}</Text>
            </View>
            {hasData ? (
                type === "bar" ? <StatsBarChart width={chartWidth} data={visibleChartData}/> : <StatsLineChart width={chartWidth} data={visibleChartData}/>
            ) : (
                <View style={styles.chartEmptyState}>
                    <Text style={styles.chartEmptyTitle}>아직 기록이 없어요</Text>
                    <Text style={styles.chartEmptyDescription}>기록을 추가하면 이곳에 통계가 표시됩니다.</Text>
                </View>
            )}
        </Pressable>
    );
}

function StatsBarChart({width, data}: { width: number; data: StatChartPoint[] }) {
    if (Platform.OS === "web") {
        return <StaticBarChart data={data}/>;
    }

    const maxValue = chartMaxValue(data);

    return (
        <View style={styles.giftedChartWrap}>
            <GiftedBarChart
                data={data.map((item) => ({value: item.value, label: item.label}))}
                width={width}
                height={136}
                maxValue={maxValue}
                noOfSections={3}
                barWidth={data.length <= 3 ? 24 : 18}
                spacing={data.length <= 3 ? 34 : 17}
                initialSpacing={data.length === 1 ? Math.max(8, width / 2 - 24) : 8}
                endSpacing={0}
                roundedTop
                disablePress
                disableScroll
                focusBarOnPress={false}
                isAnimated={false}
                frontColor="#78C9BF"
                rulesColor="#EDF2F7"
                rulesThickness={1}
                xAxisColor="#E5EAF2"
                yAxisColor="transparent"
                yAxisLabelWidth={24}
                yAxisTextStyle={styles.chartAxisText}
                xAxisLabelTextStyle={styles.chartAxisText}
                hideOrigin
            />
        </View>
    );
}

function StatsLineChart({width, data}: { width: number; data: StatChartPoint[] }) {
    if (Platform.OS === "web") {
        return <StaticLineChart data={data}/>;
    }

    const maxValue = chartMaxValue(data);

    return (
        <View style={styles.giftedChartWrap}>
            <GiftedLineChart
                data={data.map((item) => ({value: item.value, label: item.label}))}
                width={width}
                height={136}
                maxValue={maxValue}
                noOfSections={3}
                spacing={data.length <= 1 ? 38 : Math.max(28, Math.min(42, width / Math.max(data.length, 2)))}
                initialSpacing={data.length === 1 ? Math.max(8, width / 2 - 8) : 8}
                endSpacing={0}
                disableScroll
                focusEnabled={false}
                pointerConfig={{pointerEvents: "none"}}
                isAnimated={false}
                curved
                thickness={3}
                color={primary}
                areaChart
                startFillColor="#CDEDE8"
                endFillColor="#FFFFFF"
                startOpacity={0.72}
                endOpacity={0.06}
                dataPointsRadius={3.5}
                dataPointsColor={primary}
                rulesColor="#EDF2F7"
                rulesThickness={1}
                xAxisColor="#E5EAF2"
                yAxisColor="transparent"
                yAxisLabelWidth={24}
                yAxisTextStyle={styles.chartAxisText}
                xAxisLabelTextStyle={styles.chartAxisText}
                hideOrigin
            />
        </View>
    );
}

function StaticBarChart({data}: { data: StatChartPoint[] }) {
    const maxValue = chartMaxValue(data);
    const chartHeight = 96;
    const count = data.length;
    const step = count > 1 ? 216 / (count - 1) : 0;

    return (
        <View style={styles.chartCanvas} testID="stats-chart-data">
            <Svg width="100%" height="100%" viewBox={`0 0 300 ${overviewChartHeight}`}>
                {[28, 60, 92, overviewChartPlotBaseline].map((y) => (
                    <Line key={y} x1="22" y1={y} x2="282" y2={y} stroke="#EAF2EF" strokeWidth="1"/>
                ))}
                {data.map((item, index) => {
                    const centerX = count === 1 ? 150 : 42 + index * step;
                    const height = Math.round((Number(item.value) / maxValue) * chartHeight);
                    return (
                        <Rect
                            key={`${item.label}-${index}`}
                            x={centerX - 8}
                            y={overviewChartPlotBaseline - height}
                            width="16"
                            height={height}
                            rx="5"
                            fill="#78C9BF"
                        />
                    );
                })}
                {data.map((item, index) => {
                    const centerX = count === 1 ? 150 : 42 + index * step;
                    return (
                    <SvgText key={`${item.label}-label-${index}`} x={centerX} y={overviewChartLabelY} fill="#AEB7C5" fontSize="9"
                             fontWeight="700" fontFamily={FONT_FAMILY} textAnchor="middle">
                        {item.label}
                    </SvgText>
                    );
                })}
            </Svg>
        </View>
    );
}

function StaticLineChart({data}: { data: StatChartPoint[] }) {
    const values = data.map((item) => Number(item.value));
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = Math.max(maxValue - minValue, 1);
    const count = data.length;
    const step = count > 1 ? 216 / (count - 1) : 0;
    const yForValue = (value: number) => (count === 1 ? 72 : overviewChartPlotBaseline - ((value - minValue) / range) * 94);
    const coordinates = data.map((item, index) => ({
        x: count === 1 ? 150 : 42 + index * step,
        y: yForValue(Number(item.value)),
        item,
    }));
    const points = coordinates.map((point) => `${point.x},${point.y}`).join(" ");

    return (
        <View style={styles.chartCanvas} testID="stats-chart-data">
            <Svg width="100%" height="100%" viewBox={`0 0 300 ${overviewChartHeight}`}>
                {[30, 61, 92, overviewChartPlotBaseline].map((y) => (
                    <Line key={y} x1="20" y1={y} x2="280" y2={y} stroke="#EAF2EF" strokeWidth="1"/>
                ))}
                <Line x1="20" y1={overviewChartPlotBaseline} x2="280" y2={overviewChartPlotBaseline} stroke="#DDE7E2" strokeWidth="1"/>
                {coordinates.length > 1 ? (
                    <>
                        <Path d={`M${coordinates[0].x},${overviewChartPlotBaseline} L${points} L${coordinates[coordinates.length - 1].x},${overviewChartPlotBaseline} Z`}
                              fill="#E7F6F3" opacity="0.62"/>
                        <Polyline points={points} fill="none" stroke={primary} strokeWidth="3" strokeLinecap="round"
                                  strokeLinejoin="round"/>
                    </>
                ) : null}
                {coordinates.map((point, index) => (
                    <Circle key={`${point.item.label}-${index}`} cx={point.x} cy={point.y} r="4"
                            fill={primary} stroke="#FFFFFF" strokeWidth="2"/>
                ))}
                {coordinates.map((point, index) => (
                    <SvgText key={`${point.item.label}-label-${index}`} x={point.x} y={overviewChartLabelY} fill="#AEB7C5" fontSize="9" fontWeight="700"
                             fontFamily={FONT_FAMILY}
                             textAnchor="middle">
                        {point.item.label}
                    </SvgText>
                ))}
            </Svg>
        </View>
    );
}

function chartMaxValue(data: StatChartPoint[]) {
    const max = Math.max(...data.map((item) => Number(item.value)), 1);
    return Math.max(1, Math.ceil(max * 1.2));
}

function GrowthTab({label, active}: { label: string; active?: boolean }) {
    return (
        <View style={[styles.growthTab, active && styles.growthTabActive]}>
            <Text style={[styles.growthTabText, active && styles.growthTabTextActive]}>{label}</Text>
        </View>
    );
}

function GrowthChart({measurements}: { measurements: GrowthMeasurementCard[] }) {
    const points = measurements
        .filter((measurement) => measurement.weightKg != null)
        .slice(0, 6)
        .reverse();
    const values = points.map((measurement) => measurement.weightKg ?? 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const chartWidth = 210;
    const step = points.length > 1 ? chartWidth / (points.length - 1) : 0;
    const coordinates = points.map((measurement, index) => {
        const value = measurement.weightKg ?? 0;
        const x = points.length > 1 ? 44 + index * step : 150;
        const y = 178 - ((value - min) / range) * 118;
        return {x, y, measurement};
    });
    const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");

    return (
        <View style={styles.growthChart} testID="growth-percentile-chart">
            <Svg width="100%" height="100%" viewBox="0 0 300 220">
                {[44, 80, 116, 152, 188].map((y) => (
                    <Line key={y} x1="28" y1={y} x2="260" y2={y} stroke="#EAF2EF" strokeWidth="1"/>
                ))}
                {coordinates.map((point) => (
                    <Line key={`grid-${point.x}`} x1={point.x} y1="42" x2={point.x} y2="188" stroke="#F2F5FA" strokeWidth="1"/>
                ))}
                {coordinates.length > 1 ? (
                    <Polyline points={polyline} fill="none" stroke={primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                ) : null}
                {coordinates.map((point) => (
                    <Circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="4" fill={primary} stroke="#FFFFFF" strokeWidth="2"/>
                ))}
                {coordinates.map((point) => (
                    <SvgText key={`label-${point.x}`} x={point.x} y="210" fill="#AEB7C5" fontSize="9" fontWeight="700"
                             fontFamily={FONT_FAMILY}
                             textAnchor="middle">
                        {formatGrowthChartLabel(point.measurement.measuredAt)}
                    </SvgText>
                ))}
            </Svg>
        </View>
    );
}

function formatGrowthWeight(measurement: GrowthMeasurementCard | null) {
    return measurement?.weightKg == null ? "-" : `${formatMeasurementValue(measurement.weightKg)} kg`;
}

function formatMeasurementValue(value: number) {
    return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatGrowthLatestMeta(measurement: GrowthMeasurementCard, count: number) {
    return `${count}건 · 최근 ${formatGrowthDate(measurement.measuredAt)}`;
}

function formatGrowthDate(value: string) {
    return new Intl.DateTimeFormat("ko-KR", {
        month: "long",
        day: "numeric",
    }).format(new Date(value));
}

function formatGrowthChartLabel(value: string) {
    return new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
    }).format(new Date(value));
}

const styles = StyleSheet.create({
    appShell: {
        flex: 1,
        alignItems: "center",
        backgroundColor: bg,
    },
    phone: {
        flex: 1,
        width: "100%",
        maxWidth: Platform.OS === "web" ? 390 : undefined,
        backgroundColor: bg,
        overflow: "hidden",
    },
    fullScreen: {
        flex: 1,
        backgroundColor: bg,
    },
    notFound: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: horizontalGutter,
        gap: 20,
        backgroundColor: bg,
    },
    notFoundTitle: {
        color: text,
        fontSize: 20,
        fontWeight: "700",
        textAlign: "center",
    },
    inviteRedirecting: {
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: horizontalGutter,
    },
    inviteRedirectingText: {
        color: muted,
        fontSize: 14,
        fontWeight: "700",
    },
    inviteLanding: {
        alignItems: "stretch",
        gap: 16,
        paddingTop: 52,
    },
    inviteLandingIcon: {
        alignSelf: "center",
        width: 60,
        height: 60,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        backgroundColor: paleBlue,
    },
    inviteLandingTitle: {
        color: text,
        fontSize: 22,
        lineHeight: 29,
        fontWeight: "800",
        textAlign: "center",
    },
    inviteLandingBody: {
        color: muted,
        fontSize: 14,
        lineHeight: 21,
        fontWeight: "600",
        textAlign: "center",
    },
    inviteCodeCard: {
        alignItems: "center",
        gap: 7,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: "#F8FCFB",
        padding: 16,
    },
    inviteCodeCardLabel: {
        color: muted,
        fontSize: 12,
        fontWeight: "700",
    },
    inviteCodeCardValue: {
        color: text,
        fontSize: 21,
        letterSpacing: 1,
        fontWeight: "800",
    },
    inviteStoreRow: {
        flexDirection: "row",
        gap: 10,
    },
    inviteStoreButton: {
        flex: 1,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#BFE6DF",
        backgroundColor: "#F6FBFA",
    },
    inviteStoreButtonText: {
        color: primary,
        fontSize: 13,
        fontWeight: "800",
    },
    contentArea: {
        flex: 1,
        backgroundColor: bg,
    },
    routeFrame: {
        flex: 1,
        position: "relative",
        backgroundColor: bg,
    },
    formScreen: {
        paddingHorizontal: horizontalGutter,
        paddingTop: safeTop + 36,
    },
    authLogoWrap: {
        alignItems: "center",
        marginBottom: 22,
    },
    authLogo: {
        width: 220,
        height: 220,
    },
    authTitle: {
        color: text,
        fontSize: 20,
        lineHeight: 27,
        fontWeight: "600",
    },
    authSubtitle: {
        marginTop: 10,
        marginBottom: 28,
        color: muted,
        fontSize: 13,
        lineHeight: 20,
        fontWeight: "500",
    },
    inputWrap: {
        height: 44,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: "#E1E6EF",
        borderRadius: 8,
        backgroundColor: bg,
        justifyContent: "center",
    },
    input: {
        height: 44,
        paddingHorizontal: 16,
        paddingRight: 42,
        color: text,
        fontSize: 13,
    },
    inputRight: {
        position: "absolute",
        right: 13,
        color: muted,
        fontSize: 14,
        fontWeight: "600",
        pointerEvents: "none",
    },
    keepLoginRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 22,
    },
    checkedBox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary,
    },
    checkedMark: {
        color: bg,
        fontSize: 12,
        fontWeight: "700",
    },
    keepLoginText: {
        color: muted,
        fontSize: 12,
        fontWeight: "600",
    },
    primaryButton: {
        height: 46,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary,
    },
    primaryButtonText: {
        color: bg,
        fontSize: 14,
        fontWeight: "600",
    },
    linkCenter: {
        alignSelf: "center",
        marginTop: 14,
        color: primary,
        fontSize: 12,
        fontWeight: "700",
    },
    orRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        marginTop: 29,
        marginBottom: 18,
    },
    orLine: {
        flex: 1,
        height: 1,
        backgroundColor: border,
    },
    orText: {
        color: muted,
        fontSize: 12,
    },
    googleSignInButton: {
        marginBottom: 12,
    },
    appleSignInButton: {
        marginBottom: 12,
    },
    signupLinkRow: {
        marginTop: 13,
        flexDirection: "row",
        justifyContent: "center",
        gap: 6,
    },
    signupQuestion: {
        color: muted,
        fontSize: 12,
    },
    signupLink: {
        color: primary,
        fontSize: 12,
        fontWeight: "600",
    },
    authLegalLinks: {
        minHeight: 24,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    authLegalLinkText: {
        color: muted,
        fontSize: 11,
        fontWeight: "600",
    },
    authLegalSeparator: {
        color: "#CBD5E1",
        fontSize: 11,
        fontWeight: "700",
    },
    fieldLabel: {
        marginBottom: 8,
        color: text,
        fontSize: 12,
        fontWeight: "600",
    },
    mainScroll: {
        flex: 1,
        backgroundColor: bg,
    },
    mainContent: {
        paddingHorizontal: horizontalGutter,
        paddingTop: safeTop - 12,
        paddingBottom: 116,
    },
    taskAssignmentsContent: {
        flexGrow: 1,
        paddingBottom: 28,
    },
    timelineWithComposerContent: {
        paddingBottom: TIMELINE_COMPOSER_RESTING_BOTTOM + 144,
    },
    timelineMemoComposer: {
        position: "absolute",
        left: horizontalGutter,
        right: horizontalGutter,
        minHeight: 58,
        maxHeight: TIMELINE_COMPOSER_MAX_HEIGHT,
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 8,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#DDE8F4",
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 10,
        paddingVertical: 9,
        zIndex: 40,
        boxShadow: "0 10px 24px rgba(100, 116, 139, 0.14)",
    },
    timelineMemoInput: {
        minHeight: 38,
        maxHeight: 76,
        flex: 1,
        borderRadius: 14,
        backgroundColor: "#F7FAFD",
        color: text,
        fontFamily: FONT_FAMILY,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: "600",
        paddingHorizontal: 12,
        paddingVertical: 9,
        textAlignVertical: "top",
    },
    timelineMemoSubmit: {
        minWidth: 54,
        height: 38,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#6BAEA4",
        paddingHorizontal: 12,
    },
    timelineMemoSubmitDisabled: {
        backgroundColor: "#CAD8E5",
    },
    timelineMemoSubmitText: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "800",
    },
    homeHeader: {
        marginBottom: 18,
        flexDirection: "row",
        alignItems: "center",
    },
    avatar: {
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: "#FAD6BE",
    },
    avatarHair: {
        position: "absolute",
        top: 0,
        backgroundColor: "#5B4638",
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 18,
    },
    avatarFace: {
        marginTop: 5,
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        backgroundColor: "#FFD8B6",
    },
    avatarEyes: {
        flexDirection: "row",
        gap: 8,
    },
    avatarEye: {
        width: 3,
        height: 3,
        borderRadius: 2,
        backgroundColor: text,
    },
    avatarSmile: {
        width: 13,
        height: 6,
        borderBottomWidth: 2,
        borderColor: text,
        borderRadius: 999,
    },
    headerIdentity: {
        flex: 1,
        marginLeft: 10,
    },
    childName: {
        color: text,
        fontSize: 18,
        fontWeight: "600",
    },
    childMeta: {
        marginTop: 3,
        color: muted,
        fontSize: 12,
        fontWeight: "700",
    },
    headerIcon: {
        width: 34,
        color: text,
        textAlign: "center",
        fontSize: 20,
        fontWeight: "600",
    },
    headerAction: {
        width: 33,
        height: 33,
        alignItems: "center",
        justifyContent: "center",
    },
    rowBetween: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    sectionTitle: {
        color: text,
        fontSize: 15,
        fontWeight: "600",
    },
    linkText: {
        color: primary,
        fontSize: 12,
        fontWeight: "600",
    },
    statusGrid: {
        marginTop: 14,
        marginBottom: 28,
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: 'center',
        gap: 12,
    },
    statusCard: {
        width: 156,
        height: 94,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: bg,
        paddingHorizontal: 12,
        paddingTop: 11,
        paddingBottom: 10,
        ...softShadow,
    },
    cardBlue: {
        backgroundColor: "#F6FBFA",
    },
    cardGreen: {
        backgroundColor: "#F6FEFA",
    },
    cardPink: {
        backgroundColor: "#FFF8F5",
    },
    statusCardTop: {
        flexDirection: "row",
        alignItems: "flex-start",
    },
    statusMetric: {
        flex: 1,
        alignItems: "center",
        paddingTop: 3,
    },
    statusLabel: {
        marginTop: 8,
        color: text,
        fontSize: 12,
        lineHeight: 15,
        fontWeight: "600",
    },
    statusMeta: {
        color: muted,
        fontSize: 10,
        lineHeight: 12,
        fontWeight: "700",
    },
    statusValue: {
        marginTop: 3,
        color: text,
        fontSize: 15,
        lineHeight: 18,
        fontWeight: "600",
        fontVariant: ["tabular-nums"],
    },
    recentRow: {
        height: 52,
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: "#F0F2F5",
    },
    recentPerson: {
        width: 64,
        marginLeft: 10,
    },
    recentName: {
        color: text,
        fontSize: 11,
        fontWeight: "700",
    },
    recentTime: {
        marginTop: 3,
        color: muted,
        fontSize: 10,
        fontVariant: ["tabular-nums"],
    },
    recentValueWrap: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 6,
    },
    recentValue: {
        color: text,
        fontSize: 12,
        fontWeight: "700",
        fontVariant: ["tabular-nums"],
    },
    latestPhotos: {
        marginTop: 24,
        gap: 12,
    },
    homePhotoGrid: {
        flexDirection: "row",
        gap: 6,
    },
    homePhotoTile: {
        flex: 1,
        height: 52,
        borderRadius: 9,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: "#F8FAFC",
    },
    homePhotoImage: {
        width: "100%",
        height: "100%",
    },
    navHeader: {
        height: 46 + safeTop,
        paddingTop: safeTop,
        paddingHorizontal: horizontalGutter,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    navSide: {
        width: 34,
    },
    navTitle: {
        color: text,
        fontSize: 16,
        fontWeight: "600",
    },
    navAction: {
        minWidth: 34,
        color: primary,
        fontSize: 12,
        fontWeight: "600",
        textAlign: "right",
    },
    backIcon: {
        color: text,
        fontSize: 28,
        lineHeight: 30,
        fontWeight: "500",
    },
    checkAction: {
        minWidth: 34,
        color: primary,
        fontSize: 18,
        textAlign: "right",
    },
    quickGrid: {
        paddingTop: 28,
        paddingHorizontal: 20,
        paddingBottom: 40,
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "flex-start",
        columnGap: 10,
        rowGap: 22,
    },
    quickChoice: {
        width: "30%",
        minHeight: 91,
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 8,
    },
    quickChoiceDisabled: {
        opacity: 0.55,
    },
    quickIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        ...softShadow,
    },
    quickIconCircleDisabled: {
        backgroundColor: "#F1F5F9",
    },
    quickLabel: {
        color: text,
        fontSize: 12,
        fontWeight: "600",
        textAlign: "center",
    },
    quickPhotoMessage: {
        width: "100%",
        color: muted,
        fontSize: 11,
        lineHeight: 17,
        textAlign: "center",
        paddingTop: 2,
    },
    detailContent: {
        paddingHorizontal: horizontalGutter,
        paddingTop: 23,
    },
    detailLabel: {
        color: text,
        fontSize: 12,
        fontWeight: "600",
        marginTop: 22,
        marginBottom: 13,
    },
    detailValue: {
        color: text,
        fontSize: 14,
        fontWeight: "500",
    },
    logDetailEmpty: {
        minHeight: 180,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: "#F8FAFC",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        gap: 7,
    },
    logDetailEmptyTitle: {
        color: "#26364D",
        fontSize: 15,
        lineHeight: 21,
        fontWeight: "800",
        textAlign: "center",
    },
    logDetailEmptyDescription: {
        color: "#64748B",
        fontSize: 12,
        lineHeight: 18,
        fontWeight: "600",
        textAlign: "center",
    },
    amountControl: {
        height: 46,
        borderRadius: 23,
        borderWidth: 1,
        borderColor: border,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
    },
    amountButton: {
        width: 28,
        color: text,
        fontSize: 18,
        textAlign: "center",
    },
    amountDash: {
        flex: 1,
        color: "#CDD5E1",
        fontSize: 18,
    },
    amountNumber: {
        color: text,
        fontSize: 22,
        fontWeight: "700",
        fontVariant: ["tabular-nums"],
    },
    amountUnit: {
        marginLeft: 14,
        marginRight: 10,
        color: text,
        fontSize: 12,
        fontWeight: "700",
    },
    methodRow: {
        flexDirection: "row",
        gap: 10,
    },
    memoInput: {
        height: 42,
        borderRadius: 8,
        backgroundColor: card,
        justifyContent: "center",
        paddingHorizontal: 14,
    },
    placeholder: {
        color: "#AEB7C5",
        fontSize: 12,
    },
    addPhotoBox: {
        width: 54,
        height: 54,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: border,
        alignItems: "center",
        justifyContent: "center",
    },
    addPhotoPlus: {
        color: text,
        fontSize: 22,
        fontWeight: "400",
    },
    deleteArea: {
        marginTop: 73,
        alignItems: "center",
    },
    deleteText: {
        color: "#EF4444",
        fontSize: 13,
        fontWeight: "600",
    },
    timelineContent: {
        paddingHorizontal: 0,
        paddingBottom: 122,
    },
    timelineHeader: {
        height: 62 + safeTop,
        paddingTop: safeTop,
        paddingHorizontal: horizontalGutter,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: "#EEF2F7",
        backgroundColor: bg,
    },
    timelineHeaderButton: {
        width: 36,
        height: 38,
        alignItems: "flex-start",
        justifyContent: "center",
    },
    timelineHeaderButtonRight: {
        alignItems: "flex-end",
    },
    timelineTitleGroup: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 17,
        minHeight: 34,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 10,
    },
    timelineHeaderTitle: {
        color: "#26364D",
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "600",
        fontVariant: ["tabular-nums"],
    },
    timelineRow: {
        minHeight: 86,
        flexDirection: "row",
    },
    timelineTime: {
        width: 66,
        paddingTop: 23,
        paddingRight: 10,
        color: "#26364D",
        fontSize: 13,
        fontWeight: "500",
        textAlign: "right",
        fontVariant: ["tabular-nums"],
    },
    timelineRail: {
        width: 24,
        alignItems: "center",
        position: "relative",
    },
    timelineLine: {
        position: "absolute",
        top: 0,
        bottom: 0,
        width: 1,
        borderRadius: 1,
        backgroundColor: "#E7EBF2",
    },
    timelineDot: {
        position: "absolute",
        top: 26,
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: "#E1E7F0",
    },
    timelineCard: {
        flex: 1,
        minHeight: 86,
        paddingTop: 12,
        paddingRight: 20,
        paddingBottom: 10,
        paddingLeft: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#E7EBF2",
        backgroundColor: bg,
    },
    timelineHead: {
        minHeight: 26,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    timelineOwner: {
        flex: 1,
        color: "#26364D",
        fontSize: 14,
        lineHeight: 19,
        fontWeight: "600",
    },
    timelineTitleRow: {
        marginTop: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    timelineRecordIcon: {
        width: 26,
        alignItems: "center",
        justifyContent: "center",
    },
    timelineTitle: {
        flex: 1,
        color: "#26364D",
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "600",
        fontVariant: ["tabular-nums"],
    },
    timelineBody: {
        marginTop: 4,
        marginLeft: 36,
        color: "#64748B",
        fontSize: 11,
        fontWeight: "600",
    },
    moreDots: {
        color: "#334155",
        fontSize: 16,
        lineHeight: 16,
        fontWeight: "700",
    },
    statsContent: {
        paddingHorizontal: horizontalGutter,
        paddingTop: safeTop - 12,
        paddingBottom: 116,
    },
    segmented: {
        height: 38,
        marginTop: 0,
        marginBottom: 14,
        borderRadius: 9,
        flexDirection: "row",
        backgroundColor: "#F3F6FB",
    },
    segment: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 9,
    },
    segmentActive: {
        backgroundColor: "#E7F6F3",
    },
    segmentText: {
        color: text,
        fontSize: 12,
        fontWeight: "700",
    },
    segmentTextActive: {
        color: primary,
    },
    dateControl: {
        height: 32,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    dateButton: {
        width: 34,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
    },
    rangePickerButton: {
        minWidth: 150,
        height: 30,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "transparent",
        paddingHorizontal: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
    },
    rangePickerButtonActive: {
        borderColor: "#BFE6DF",
        backgroundColor: "#F6FBFA",
    },
    rangeText: {
        color: text,
        fontSize: 12,
        fontWeight: "600",
        fontVariant: ["tabular-nums"],
    },
    statsCategoryScroll: {
        gap: 8,
        paddingBottom: 10,
    },
    statsCategoryChip: {
        minWidth: 76,
        height: 34,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: bg,
        paddingHorizontal: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
    },
    statsCategoryChipActive: {
        borderColor: "#BFE6DF",
        backgroundColor: "#E7F6F3",
    },
    statsCategoryChipText: {
        color: "#475569",
        fontSize: 11,
        fontWeight: "600",
    },
    statsCategoryChipTextActive: {
        color: primary,
    },
    statsSummaryCard: {
        minHeight: 92,
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: bg,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        ...softShadow,
    },
    statsSummaryIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F3F6FB",
    },
    statsSummaryCopy: {
        flex: 1,
        gap: 3,
    },
    statsSummaryLabel: {
        color: muted,
        fontSize: 12,
        fontWeight: "600",
    },
    statsSummaryValue: {
        color: text,
        fontSize: 20,
        fontWeight: "700",
        fontVariant: ["tabular-nums"],
    },
    statsSummaryMeta: {
        color: "#64748B",
        fontSize: 11,
        fontWeight: "600",
        fontVariant: ["tabular-nums"],
    },
    statsSummaryAction: {
        minWidth: 48,
        height: 32,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#E7F6F3",
    },
    statsSummaryActionText: {
        color: primary,
        fontSize: 12,
        fontWeight: "600",
    },
    statsSectionTitle: {
        color: text,
        fontSize: 15,
        fontWeight: "600",
        marginBottom: 8,
    },
    statsCategoryGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    statsCategoryCard: {
        width: "31%",
        minHeight: 88,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: bg,
        padding: 10,
        gap: 6,
    },
    statsCategoryCardActive: {
        borderColor: "#A8D9D1",
        backgroundColor: "#F6FBFA",
    },
    statsCategoryLabel: {
        color: "#64748B",
        fontSize: 11,
        fontWeight: "600",
    },
    statsCategoryValue: {
        color: text,
        fontSize: 13,
        fontWeight: "700",
        fontVariant: ["tabular-nums"],
    },
    chartCard: {
        marginBottom: 12,
        borderRadius: 12,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        padding: 14,
        ...softShadow,
    },
    chartTitle: {
        color: text,
        fontSize: 15,
        fontWeight: "700",
    },
    chartMeta: {
        color: muted,
        fontSize: 11,
        fontWeight: "700",
        fontVariant: ["tabular-nums"],
    },
    chartEmptyState: {
        height: overviewChartHeight,
        marginTop: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E8EEF7",
        backgroundColor: "#F8FAFD",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        gap: 6,
    },
    chartEmptyTitle: {
        color: "#26364D",
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "800",
        textAlign: "center",
    },
    chartEmptyDescription: {
        color: "#64748B",
        fontSize: 12,
        lineHeight: 18,
        fontWeight: "600",
        textAlign: "center",
    },
    giftedChartWrap: {
        height: 164,
        marginTop: 12,
        overflow: "hidden",
    },
    chartAxisText: {
        color: "#AEB7C5",
        fontSize: 9,
        fontWeight: "700",
        fontVariant: ["tabular-nums"],
    },
    chartCanvas: {
        height: overviewChartHeight,
        marginTop: 14,
        overflow: "hidden",
    },
    barColumn: {
        width: 32,
        alignItems: "center",
        gap: 6,
    },
    bar: {
        width: 17,
        borderRadius: 5,
        backgroundColor: "#78C9BF",
    },
    chartAxis: {
        color: "#AEB7C5",
        fontSize: 9,
        fontWeight: "700",
        fontVariant: ["tabular-nums"],
    },
    lineColumn: {
        width: 32,
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 4,
    },
    linePoint: {
        position: "absolute",
        width: 7,
        height: 7,
        borderRadius: 7,
        backgroundColor: primary,
    },
    growthTopTabs: {
        height: 42,
        marginHorizontal: horizontalGutter,
        marginTop: safeTop - 6,
        borderRadius: 9,
        flexDirection: "row",
        backgroundColor: "#F3F6FB",
    },
    growthTab: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 9,
    },
    growthTabActive: {
        backgroundColor: "#E7F6F3",
    },
    growthTabText: {
        color: text,
        fontSize: 12,
        fontWeight: "700",
    },
    growthTabTextActive: {
        color: primary,
    },
    growthContent: {
        paddingHorizontal: horizontalGutter,
        paddingTop: 18,
    },
    growthHeader: {
        marginTop: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    growthWeight: {
        color: text,
        fontSize: 23,
        fontWeight: "700",
        fontVariant: ["tabular-nums"],
    },
    growthRank: {
        color: text,
        fontSize: 12,
        fontWeight: "600",
        fontVariant: ["tabular-nums"],
    },
    growthChart: {
        height: 240,
        marginTop: 15,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: "#FCFDFF",
        position: "relative",
        ...softShadow,
    },
    growthEmptyState: {
        minHeight: 210,
        marginTop: 15,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: "#F8FAFC",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        gap: 7,
    },
    growthEmptyTitle: {
        color: "#26364D",
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "800",
        textAlign: "center",
    },
    growthEmptyDescription: {
        color: "#64748B",
        fontSize: 12,
        lineHeight: 18,
        fontWeight: "600",
        textAlign: "center",
    },
    growthGridLine: {
        position: "absolute",
        left: 14,
        right: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    growthGridRule: {
        flex: 1,
        height: 1,
        backgroundColor: "#DDE7E2",
    },
    growthPercent: {
        width: 28,
        color: "#2F8F88",
        fontSize: 10,
        fontWeight: "600",
        fontVariant: ["tabular-nums"],
    },
    growthDot: {
        position: "absolute",
        width: 6,
        height: 6,
        borderRadius: 6,
        backgroundColor: primary,
    },
    growthNote: {
        marginTop: 18,
        color: muted,
        fontSize: 11,
    },
    growthAddButton: {
        height: 42,
        marginTop: 27,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F3F6FB",
    },
    growthAddText: {
        color: primary,
        fontSize: 13,
        fontWeight: "600",
    },
    tabBar: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 76,
        borderTopWidth: 1,
        borderTopColor: "#EDF1F6",
        backgroundColor: bg,
        flexDirection: "row",
        alignItems: "flex-start",
        paddingTop: 12,
        paddingHorizontal: 14,
    },
    tabItem: {
        flex: 1,
        alignItems: "center",
        gap: 3,
    },
    tabLabel: {
        color: "#4B5563",
        fontSize: 10,
        fontWeight: "600",
    },
    tabLabelActive: {
        color: primary,
    },
    plusTab: {
        flex: 1,
        alignItems: "center",
        marginTop: -26,
    },
    plusButton: {
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary,
        boxShadow: "0 10px 18px rgba(77, 182, 172, 0.28)",
    },
    plusButtonMuted: {
        opacity: 0.45,
    },
    familyChatFab: {
        position: "absolute",
        right: 16,
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#BFE4DF",
        backgroundColor: "#E7F6F3",
        boxShadow: "0 8px 16px rgba(77, 182, 172, 0.22)",
        zIndex: 4,
    },
    plusText: {
        color: bg,
        fontSize: 30,
        lineHeight: 32,
        fontWeight: "500",
    },
    plusLabel: {
        marginTop: 2,
        color: primary,
        fontSize: 10,
        fontWeight: "600",
    },
});
