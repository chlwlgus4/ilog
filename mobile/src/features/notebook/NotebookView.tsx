import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { NotebookResponse, ScheduleCategory } from "../../api";
import { formatDateTime, scheduleLabel } from "../../constants";
import { AppInput, ChoiceChip, EmptyCard, Field, PrimaryButton } from "../../ui";
import { RecordIcon } from "../shared/RecordIcon";

type ReportMode = "daily" | "growth";
type EntryMode = "schedule" | "memory";

export function NotebookView({
  notebook,
  scheduleForm,
  setScheduleForm,
  memoryForm,
  setMemoryForm,
  busyAction,
  onSchedule,
  onMemory,
}: {
  notebook: NotebookResponse | null;
  scheduleForm: { title: string; category: ScheduleCategory; startAt: string; endAt: string; note: string };
  setScheduleForm: React.Dispatch<
    React.SetStateAction<{ title: string; category: ScheduleCategory; startAt: string; endAt: string; note: string }>
  >;
  memoryForm: { title: string; note: string; imageUrl: string; tag: string; happenedAt: string };
  setMemoryForm: React.Dispatch<
    React.SetStateAction<{ title: string; note: string; imageUrl: string; tag: string; happenedAt: string }>
  >;
  busyAction: string | null;
  onSchedule: () => void;
  onMemory: () => void;
}) {
  const [reportMode, setReportMode] = useState<ReportMode>("daily");
  const [entryMode, setEntryMode] = useState<EntryMode>("schedule");
  const schedules = notebook?.schedules ?? [];
  const memories = notebook?.memories ?? [];

  return (
    <>
      <View style={styles.navHeader}>
        <Pressable accessibilityRole="button">
          <RecordIcon name="back-arrow" size={24} />
        </Pressable>
        <View style={styles.reportSwitch}>
          <Pressable style={[styles.switchItem, reportMode === "daily" && styles.switchItemActive]} onPress={() => setReportMode("daily")} testID="notebook-mode-daily">
            <Text style={[styles.switchText, reportMode === "daily" && styles.switchTextActive]}>일간</Text>
          </Pressable>
          <Pressable style={[styles.switchItem, reportMode === "growth" && styles.switchItemActive]} onPress={() => setReportMode("growth")} testID="notebook-mode-growth">
            <Text style={[styles.switchText, reportMode === "growth" && styles.switchTextActive]}>성장</Text>
          </Pressable>
        </View>
        <RecordIcon name="filter" size={24} />
      </View>

      {reportMode === "daily" ? <DailyStatsPanel schedulesCount={schedules.length} memoriesCount={memories.length} /> : <GrowthPanel onAddMemory={() => setEntryMode("memory")} />}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>다가오는 일정</Text>
          <Text style={styles.linkText}>{schedules.length ? "전체 보기" : "추가 대기"}</Text>
        </View>
        {schedules.length ? (
          schedules.slice(0, 3).map((schedule) => (
            <View key={schedule.id} style={styles.scheduleRow}>
              <RecordIcon name="hospital" size={34} />
              <View style={styles.scheduleCopy}>
                <Text style={styles.scheduleTitle}>{schedule.title}</Text>
                <Text style={styles.scheduleMeta}>
                  {scheduleLabel[schedule.category]} · {formatDateTime(schedule.startAt)}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyCard message="가까운 일정이 아직 없어요." />
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>기록/일정 추가</Text>
          <View style={styles.chipRowCompact}>
            <ChoiceChip label="일정" active={entryMode === "schedule"} onPress={() => setEntryMode("schedule")} />
            <ChoiceChip label="메모" active={entryMode === "memory"} onPress={() => setEntryMode("memory")} />
          </View>
        </View>

        {entryMode === "schedule" ? (
          <View style={styles.formBlock}>
            <Field label="일정 제목">
              <AppInput placeholder="예: 소아과 정기 진료" value={scheduleForm.title} onChangeText={(title) => setScheduleForm((current) => ({ ...current, title }))} />
            </Field>
            <View style={styles.chipRow}>
              {(["HOSPITAL", "VACCINE", "DAYCARE", "SCHOOL", "HOME", "ACTIVITY"] as ScheduleCategory[]).map((category) => (
                <ChoiceChip
                  key={category}
                  label={scheduleLabel[category]}
                  active={scheduleForm.category === category}
                  onPress={() => setScheduleForm((current) => ({ ...current, category }))}
                />
              ))}
            </View>
            <Field label="시작">
              <AppInput value={scheduleForm.startAt} onChangeText={(startAt) => setScheduleForm((current) => ({ ...current, startAt }))} autoCapitalize="none" />
            </Field>
            <Field label="메모">
              <AppInput placeholder="준비물이나 꼭 챙길 내용을 적어주세요." value={scheduleForm.note} onChangeText={(note) => setScheduleForm((current) => ({ ...current, note }))} multiline style={styles.textArea} />
            </Field>
            <PrimaryButton label={busyAction === "schedule" ? "저장하는 중..." : "일정 저장"} onPress={onSchedule} />
          </View>
        ) : (
          <View style={styles.formBlock}>
            <Field label="기록 제목">
              <AppInput placeholder="예: 처음으로 혼자 블록 쌓기" value={memoryForm.title} onChangeText={(title) => setMemoryForm((current) => ({ ...current, title }))} />
            </Field>
            <Field label="태그">
              <AppInput placeholder="예: 성장, 놀이, 식사" value={memoryForm.tag} onChangeText={(tag) => setMemoryForm((current) => ({ ...current, tag }))} />
            </Field>
            <Field label="메모">
              <AppInput placeholder="그때의 표정이나 반응을 간단히 적어주세요." value={memoryForm.note} onChangeText={(note) => setMemoryForm((current) => ({ ...current, note }))} multiline style={styles.textArea} />
            </Field>
            <PrimaryButton label={busyAction === "memory" ? "저장하는 중..." : "기억 저장"} onPress={onMemory} />
          </View>
        )}
      </View>
    </>
  );
}

function DailyStatsPanel({ schedulesCount, memoriesCount }: { schedulesCount: number; memoriesCount: number }) {
  const todayLabel = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <View style={styles.reportStack}>
      <View style={styles.dateRange}>
        <Text style={styles.chevronText}>‹</Text>
        <Text style={styles.rangeText}>{todayLabel}</Text>
        <Text style={styles.chevronText}>›</Text>
      </View>

      <ReportEmptyCard title="수유" description="수유 기록을 추가하면 집계가 표시됩니다." />
      <ReportEmptyCard title="수면" description="수면 기록을 추가하면 집계가 표시됩니다." />

      <View style={styles.statGrid}>
        <MiniStat label="일정" value={`${schedulesCount}`} icon="hospital" />
        <MiniStat label="메모" value={`${memoriesCount}`} icon="memo" />
      </View>
    </View>
  );
}

function GrowthPanel({ onAddMemory }: { onAddMemory: () => void }) {
  return (
    <View style={styles.reportStack}>
      <View style={styles.growthTabs}>
        {["키", "몸무게", "머리둘레"].map((label, index) => (
          <View key={label} style={[styles.growthTab, index === 1 && styles.growthTabActive]}>
            <Text style={[styles.growthTabText, index === 1 && styles.growthTabTextActive]}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.growthCard}>
        <Text style={styles.growthValue}>-</Text>
        <Text style={styles.growthPercent}>기록 없음</Text>
        <View style={styles.growthEmptyChart}>
          <Text style={styles.reportEmptyTitle}>아직 성장 기록이 없어요</Text>
          <Text style={styles.reportEmptyDescription}>성장 기록을 추가하면 추이가 표시됩니다.</Text>
        </View>
        <Pressable style={styles.addRecordButton} onPress={onAddMemory} testID="growth-add-record" accessibilityRole="button">
          <Text style={styles.addRecordText}>+ 기록 추가</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReportEmptyCard({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        <Text style={styles.chartMeta}>기록 없음</Text>
      </View>
      <View style={styles.reportEmptyChart}>
        <Text style={styles.reportEmptyTitle}>아직 기록이 없어요</Text>
        <Text style={styles.reportEmptyDescription}>{description}</Text>
      </View>
    </View>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: "hospital" | "memo" }) {
  return (
    <View style={styles.miniStat}>
      <RecordIcon name={icon} size={34} />
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  navHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backGlyph: {
    color: "#334155",
    fontSize: 30,
    lineHeight: 32,
  },
  filterGlyph: {
    color: "#334155",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
  },
  reportSwitch: {
    flexDirection: "row",
    borderRadius: 9,
    backgroundColor: "#E7F6F3",
    padding: 3,
  },
  switchItem: {
    minWidth: 82,
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 8,
  },
  switchItemActive: {
    backgroundColor: "#DCE7FF",
  },
  switchText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
  },
  switchTextActive: {
    color: "#4DB6AC",
  },
  reportStack: {
    gap: 14,
  },
  dateRange: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  chevronText: {
    color: "#64748B",
    fontSize: 24,
  },
  rangeText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  chartCard: {
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EDF1F8",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chartTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  chartMeta: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  reportEmptyChart: {
    minHeight: 118,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6EDF8",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 6,
  },
  reportEmptyTitle: {
    color: "#26364D",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  reportEmptyDescription: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  barChart: {
    height: 122,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E6EDF8",
  },
  barColumn: {
    width: 34,
    alignItems: "center",
    gap: 6,
  },
  bar: {
    width: 18,
    borderRadius: 6,
    backgroundColor: "#8EABFF",
  },
  axisLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "600",
  },
  lineChart: {
    height: 132,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E6EDF8",
    position: "relative",
  },
  pointColumn: {
    width: 34,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 3,
  },
  linePoint: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: "#4DB6AC",
  },
  statGrid: {
    flexDirection: "row",
    gap: 10,
  },
  miniStat: {
    flex: 1,
    gap: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EDF1F8",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  miniStatLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  miniStatValue: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  growthTabs: {
    flexDirection: "row",
    gap: 6,
    alignSelf: "center",
    borderRadius: 10,
    backgroundColor: "#E7F6F3",
    padding: 4,
  },
  growthTab: {
    minWidth: 78,
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 8,
  },
  growthTabActive: {
    backgroundColor: "#DCE7FF",
  },
  growthTabText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  growthTabTextActive: {
    color: "#4DB6AC",
  },
  growthCard: {
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EDF1F8",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  growthValue: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  growthPercent: {
    alignSelf: "flex-end",
    marginTop: -30,
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  growthChart: {
    height: 178,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    position: "relative",
    overflow: "hidden",
  },
  growthEmptyChart: {
    minHeight: 156,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6EDF8",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 6,
  },
  percentLine: {
    position: "absolute",
    left: 14,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  percentRule: {
    flex: 1,
    height: 1,
    backgroundColor: "#DCE7FF",
  },
  percentText: {
    color: "#2F8F88",
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  curvePoint: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#4DB6AC",
  },
  growthFootnote: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  addRecordButton: {
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#F3F6FF",
    paddingVertical: 13,
  },
  addRecordText: {
    color: "#4DB6AC",
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    gap: 12,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EDF8",
    padding: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
  },
  linkText: {
    color: "#4DB6AC",
    fontSize: 12,
    fontWeight: "700",
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    padding: 12,
  },
  scheduleCopy: {
    flex: 1,
    gap: 2,
  },
  scheduleTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  scheduleMeta: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chipRowCompact: {
    flexDirection: "row",
    gap: 6,
  },
  formBlock: {
    gap: 10,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E9EFF8",
    padding: 14,
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: "top",
  },
});
