import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import type { CaregiverSummary, DashboardResponse, FamilyPhotoCard, LogCard, LogType, SessionResponse, TaskCard } from "../../api";
import { formatDateTime, formatShortTime, logTypeLabel, reminderLabel } from "../../constants";
import { AppInput, ChoiceChip, EmptyCard, Field, PrimaryButton, SecondaryButton } from "../../ui";
import type { TaskFormState } from "../../hooks/babyBossAppTypes";
import { formatChildAge } from "../shared/childAge";
import { feedingMetricForLog, formatFeedingMetric } from "../shared/feedingRecord";
import { ProfileAvatar } from "../shared/ProfileAvatar";
import { RecordIcon, type RecordIconName } from "../shared/RecordIcon";
import { visibleTaskDescription } from "./dashboardTaskUtils";

export function DashboardView({
  dashboard,
  session,
  caregivers,
  recentPhotos,
  taskForm,
  setTaskForm,
  busyAction,
  onTask,
  onComplete,
  onOpenChat,
  onOpenNotebook,
  onOpenTaskList,
  onOpenPhotoAlbum,
  onOpenAlerts,
  onOpenSettings,
}: {
  dashboard: DashboardResponse | null;
  session: SessionResponse | null;
  caregivers: CaregiverSummary[];
  recentPhotos: FamilyPhotoCard[] | null;
  taskForm: TaskFormState;
  setTaskForm: Dispatch<SetStateAction<TaskFormState>>;
  busyAction: string | null;
  onTask: () => Promise<boolean>;
  onComplete: (taskId: number) => void;
  onOpenChat: () => void;
  onOpenNotebook: () => void;
  onOpenTaskList: () => void;
  onOpenPhotoAlbum: () => void;
  onOpenAlerts: () => void;
  onOpenSettings: () => void;
}) {
  const latest = useMemo(() => buildStatusCards(dashboard), [dashboard]);
  const recentLogs = dashboard?.recentLogs.slice(0, 4) ?? [];
  const latestPhotos = recentPhotos?.slice(0, 3) ?? [];
  const primaryTask = dashboard?.tasksToday.find((task) => task.status !== "DONE") ?? dashboard?.tasksToday[0] ?? null;
  const taskCount = dashboard?.tasksToday.length ?? 0;
  const child = session?.child ?? dashboard?.child ?? null;
  const caregiversByName = useMemo(() => new Map(caregivers.map((caregiver) => [caregiver.name, caregiver])), [caregivers]);
  const [isTaskModalOpen, setTaskModalOpen] = useState(false);
  const primaryTaskDescription = visibleTaskDescription(primaryTask?.description);

  return (
    <View style={styles.dashboardStack}>
      <View style={styles.homeHeader} testID="home-child-header">
        <View style={styles.childIdentity}>
          <ProfileAvatar size={46} imageUrl={child?.imageUrl} />
          <View style={styles.childCopy}>
            <Text style={styles.childName}>{child?.name ?? "아이 정보 없음"}</Text>
            <Text style={styles.childDay}>{child ? formatChildAge(child.birthDate) ?? "아이 정보 입력 필요" : "아이 정보 입력 필요"}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerButton} onPress={onOpenAlerts} accessibilityRole="button" testID="home-open-alerts">
            <RecordIcon name="notification-bell" size={21} color="#26364D" strokeWidth={2} />
            {dashboard?.stats.unreadHighlights ? <View style={styles.alertDot} /> : null}
          </Pressable>
          <Pressable style={styles.headerButton} onPress={onOpenSettings} accessibilityRole="button" testID="home-open-settings">
            <RecordIcon name="settings-gear" size={21} color="#26364D" strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>오늘 한눈에 보기</Text>
        <Pressable onPress={onOpenNotebook} accessibilityRole="button" testID="home-summary-more">
          <Text style={styles.linkText}>더보기</Text>
        </Pressable>
      </View>
      <View style={styles.statusGrid}>
        {latest.map((card) => (
          <View key={card.key} style={[styles.statusCard, { backgroundColor: card.background }]} testID={`home-status-${card.key}`}>
            <View style={styles.statusTop}>
              <View style={[styles.statusIconBox, { backgroundColor: card.iconBackground }]}>
                <RecordIcon name={card.icon} size={30} />
              </View>
              <View style={styles.statusMetric}>
                <Text style={styles.statusCaption}>{card.caption}</Text>
                <Text style={[styles.statusValue, { color: card.valueColor }]} testID={`home-status-${card.key}-value`}>{card.value}</Text>
              </View>
            </View>
            <Text style={[styles.statusLabel, { color: card.labelColor }]}>{card.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.recentSection}>
        <View style={styles.sectionHeaderInline}>
          <Text style={styles.sectionTitle}>최근 기록</Text>
          <Pressable onPress={onOpenChat}>
            <Text style={styles.linkText}>전체 보기</Text>
          </Pressable>
        </View>
        {recentLogs.length ? (
          recentLogs.map((log) => {
            const caregiver = caregiversByName.get(log.caregiverName);
            return (
              <ActivityRow
                key={log.id}
                log={log}
                caregiverImageUrl={caregiver?.imageUrl ?? null}
                caregiverName={log.caregiverName || caregiver?.name || "가족"}
              />
            );
          })
        ) : (
          <EmptyCard message="아직 남겨진 기록이 없어요." />
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderInline}>
          <View style={styles.taskSectionTitleWrap}>
            <Text style={styles.sectionTitle}>오늘 분담 힌트</Text>
            {taskCount > 0 ? <Text style={styles.taskCount}>+{taskCount}</Text> : null}
          </View>
          <View style={styles.taskHeaderActions}>
            <Pressable
              style={styles.taskAddButton}
              onPress={() => setTaskModalOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="오늘 분담 추가"
              testID="dashboard-add-task"
            >
              <RecordIcon name="add-plus" size={14} color="#278D84" strokeWidth={2.4} />
              <Text style={styles.taskAddButtonText}>추가</Text>
            </Pressable>
            <Pressable onPress={onOpenTaskList} accessibilityRole="button" testID="dashboard-open-task-list">
              <Text style={styles.linkText}>더보기</Text>
            </Pressable>
          </View>
        </View>
        {primaryTask ? (
          <View style={styles.taskCard}>
            <Text style={styles.taskMeta}>
              {primaryTask.assigneeName} 담당 · {formatDateTime(primaryTask.dueAt)}
            </Text>
            <Text style={styles.taskTitle}>{primaryTask.title}</Text>
            {primaryTaskDescription ? <Text style={styles.taskBody}>{primaryTaskDescription}</Text> : null}
            {taskReminderText(primaryTask) ? <Text style={styles.taskReminder}>{taskReminderText(primaryTask)}</Text> : null}
            <SecondaryButton
              label={primaryTask.status === "DONE" ? "완료됨" : busyAction === `complete-${primaryTask.id}` ? "처리 중..." : "완료로 표시"}
              disabled={primaryTask.status === "DONE" || busyAction === `complete-${primaryTask.id}`}
              onPress={() => onComplete(primaryTask.id)}
              testID="task-complete-button"
            />
          </View>
        ) : (
          <EmptyCard
            message="오늘 등록된 분담이 없어요. 추가 버튼으로 할 일을 등록해 주세요."
            fitSingleLine
            wideSingleLine={Platform.OS === "android"}
          />
        )}
        <TaskRegistrationModal
          visible={isTaskModalOpen}
          taskForm={taskForm}
          setTaskForm={setTaskForm}
          caregivers={caregivers}
          busyAction={busyAction}
          onClose={() => setTaskModalOpen(false)}
          onTask={onTask}
        />
      </View>

      <View style={styles.photoAlbumSection} testID="home-photo-album">
        <View style={styles.sectionHeaderInline}>
          <Text style={styles.sectionTitle}>사진 앨범</Text>
          <Pressable onPress={onOpenPhotoAlbum} accessibilityRole="button" testID="home-photo-album-more">
            <Text style={styles.linkText}>더보기</Text>
          </Pressable>
        </View>
        {recentPhotos == null ? (
          <EmptyCard message="사진을 불러오는 중이에요." />
        ) : latestPhotos.length > 0 ? (
          <View style={styles.photoAlbumGrid}>
            {latestPhotos.map((photo) => (
              <Pressable
                key={photo.id}
                style={styles.photoAlbumTile}
                onPress={onOpenPhotoAlbum}
                accessibilityRole="button"
                accessibilityLabel="사진 앨범 열기"
                testID={`home-photo-album-item-${photo.id}`}>
                <Image
                  source={{ uri: photo.imageUrl, cache: "force-cache" }}
                  style={styles.photoAlbumImage}
                  resizeMode="cover"
                  resizeMethod={Platform.OS === "android" ? "resize" : "auto"}
                  progressiveRenderingEnabled={Platform.OS === "android"}
                />
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyCard message="아직 등록된 사진이 없어요." />
        )}
      </View>
    </View>
  );
}

export function TaskRegistrationModal({
  visible,
  taskForm,
  setTaskForm,
  caregivers,
  busyAction,
  onClose,
  onTask,
}: {
  visible: boolean;
  taskForm: TaskFormState;
  setTaskForm: Dispatch<SetStateAction<TaskFormState>>;
  caregivers: CaregiverSummary[];
  busyAction: string | null;
  onClose: () => void;
  onTask: () => Promise<boolean>;
}) {
  const reminderEnabled = Boolean(taskForm.reminderAfterMinutes.trim());

  async function handleSave() {
    const saved = await onTask();

    if (saved) {
      onClose();
    }
  }

  function toggleAdditionalRecipient(caregiverId: number) {
    const id = String(caregiverId);

    setTaskForm((current) => ({
      ...current,
      notificationRecipientIds: current.notificationRecipientIds.includes(id)
        ? current.notificationRecipientIds.filter((recipientId) => recipientId !== id)
        : [...current.notificationRecipientIds, id],
    }));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot} testID="dashboard-task-modal">
        <Pressable style={styles.modalBackdrop} onPress={onClose} testID="dashboard-task-modal-backdrop" />
        <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === "ios" ? "padding" : undefined} pointerEvents="box-none">
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>오늘 분담 추가</Text>
                <Text style={styles.modalSubtitle}>알림 시간과 받을 가족을 함께 설정할 수 있어요.</Text>
              </View>
              <Pressable style={styles.modalCloseButton} onPress={onClose} accessibilityRole="button" testID="dashboard-task-modal-close">
                <Text style={styles.modalCloseText}>닫기</Text>
              </Pressable>
            </View>
            <View style={styles.modalContent}>
              <Field label="할 일 제목">
                <AppInput
                  placeholder="예: 저녁 목욕 준비"
                  value={taskForm.title}
                  onChangeText={(title) => setTaskForm((current) => ({ ...current, title }))}
                  testID="dashboard-task-title-input"
                />
              </Field>
              <Field label="담당자">
                <Text style={styles.modalHint}>자동 추천을 선택하면 최근 분담량을 기준으로 담당자를 정해요.</Text>
                <View style={styles.chipRow}>
                  <ChoiceChip label="자동 추천" active={taskForm.assigneeId === "auto"} onPress={() => setTaskForm((current) => ({ ...current, assigneeId: "auto" }))} />
                  {caregivers.map((caregiver) => (
                    <ChoiceChip
                      key={caregiver.id}
                      label={caregiver.name}
                      active={taskForm.assigneeId === String(caregiver.id)}
                      onPress={() => setTaskForm((current) => ({ ...current, assigneeId: String(caregiver.id) }))}
                      testID={`dashboard-assignee-${caregiver.id}`}
                    />
                  ))}
                </View>
              </Field>
              <Field label="알림 시간">
                <Text style={styles.modalHint}>비워 두면 이 할 일의 푸시 알림을 보내지 않아요.</Text>
                <View style={styles.chipRow}>
                  {[
                    ["5", "5분 뒤"],
                    ["10", "10분 뒤"],
                    ["30", "30분 뒤"],
                    ["60", "1시간 뒤"],
                  ].map(([minutes, label]) => (
                    <ChoiceChip
                      key={minutes}
                      label={label}
                      active={taskForm.reminderAfterMinutes === minutes}
                      onPress={() => setTaskForm((current) => ({ ...current, reminderAfterMinutes: current.reminderAfterMinutes === minutes ? "" : minutes }))}
                      testID={`dashboard-task-reminder-${minutes}`}
                    />
                  ))}
                </View>
                <View style={styles.reminderInputRow}>
                  <AppInput
                    style={styles.reminderInput}
                    value={taskForm.reminderAfterMinutes}
                    onChangeText={(value) => setTaskForm((current) => ({ ...current, reminderAfterMinutes: value.replace(/[^0-9]/g, "") }))}
                    placeholder="직접 입력"
                    keyboardType="number-pad"
                    maxLength={4}
                    testID="dashboard-task-reminder-input"
                  />
                  <Text style={styles.reminderInputSuffix}>분 뒤</Text>
                </View>
              </Field>
              {reminderEnabled ? (
                <Field label="추가 알림 대상">
                  <Text style={styles.modalHint}>담당자와 작성자는 자동으로 함께 알림을 받아요. 필요한 가족을 더 선택해 주세요.</Text>
                  <View style={styles.chipRow}>
                    {caregivers.map((caregiver) => (
                      <ChoiceChip
                        key={caregiver.id}
                        label={caregiver.name}
                        active={taskForm.notificationRecipientIds.includes(String(caregiver.id))}
                        onPress={() => toggleAdditionalRecipient(caregiver.id)}
                        testID={`dashboard-task-recipient-${caregiver.id}`}
                      />
                    ))}
                  </View>
                </Field>
              ) : null}
            </View>
            <View style={styles.modalFooter}>
              <PrimaryButton label={busyAction === "task" ? "저장 중..." : "저장"} onPress={() => void handleSave()} disabled={busyAction === "task"} testID="dashboard-save-task" />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function taskReminderText(task: TaskCard) {
  if (task.reminderAfterMinutes != null) {
    return `${task.reminderAfterMinutes}분 뒤 알림 · 담당자와 작성자에게 전송`;
  }

  if (task.reminderMinutesBefore != null) {
    return `리마인더 ${reminderLabel(task.reminderMinutesBefore)}`;
  }

  return null;
}

function ActivityRow({
  log,
  caregiverImageUrl,
  caregiverName,
}: {
  log: LogCard;
  caregiverImageUrl?: string | null;
  caregiverName: string;
}) {
  return (
    <View style={styles.activityRow} testID="dashboard-activity-row">
      <ProfileAvatar size={30} imageUrl={caregiverImageUrl} />
      <View style={styles.activityCopy}>
        <Text style={styles.activityTitle}>{caregiverName}</Text>
        <Text style={styles.activityMeta}>{formatShortTime(log.recordedAt)}</Text>
      </View>
      <View style={styles.activityValueWrap}>
        <RecordIcon name={iconForLogType(log.type)} size={14} />
        <Text style={styles.activityValue}>{formatActivityValue(log)}</Text>
      </View>
    </View>
  );
}

function buildStatusCards(dashboard: DashboardResponse | null) {
  const feeding = findLatestLog(dashboard, "FEEDING");
  const sleep = findLatestLog(dashboard, "SLEEP");
  const diaper = findLatestLog(dashboard, "DIAPER");
  const temperature = findLatestLog(dashboard, "TEMPERATURE");

  return [
    {
      key: "feeding",
      label: "맘마",
      caption: feeding ? relativeTimeLabel(feeding.recordedAt) : "기록 없음",
      value: formatFeedingValue(feeding),
      icon: "feeding" as const,
      logType: "FEEDING" as const,
      background: "#FFFFFF",
      iconBackground: "#F2F7FF",
      labelColor: "#4167D9",
      valueColor: "#111827",
    },
    {
      key: "sleep",
      label: "잠",
      caption: sleep ? relativeTimeLabel(sleep.recordedAt) : "기록 없음",
      value: sleep?.value ?? "-",
      icon: "sleep" as const,
      logType: "SLEEP" as const,
      background: "#FFFFFF",
      iconBackground: "#F4F5FF",
      labelColor: "#5971D8",
      valueColor: "#111827",
    },
    {
      key: "diaper",
      label: "기저귀",
      caption: `오늘 ${countTodayLogs(dashboard, "DIAPER")}회`,
      value: diaper?.value ?? "-",
      icon: "diaper" as const,
      logType: "DIAPER" as const,
      background: "#FFFFFF",
      iconBackground: "#F0FBF5",
      labelColor: "#4F8C7B",
      valueColor: "#111827",
    },
    {
      key: "temperature",
      label: "체온",
      caption: temperature ? relativeTimeLabel(temperature.recordedAt) : "기록 없음",
      value: temperature?.value ?? "-",
      icon: "temperature" as const,
      logType: "TEMPERATURE" as const,
      background: "#FFFFFF",
      iconBackground: "#FFF4EF",
      labelColor: "#E26F64",
      valueColor: "#111827",
    },
  ];
}

function findLatestLog(dashboard: DashboardResponse | null, type: LogType) {
  return dashboard?.recentLogs.find((log) => log.type === type) ?? null;
}

function countTodayLogs(dashboard: DashboardResponse | null, type: LogType) {
  const todayKey = toDateKey(new Date());
  return dashboard?.recentLogs.filter((log) => log.type === type && toDateKey(new Date(log.recordedAt)) === todayKey).length ?? 0;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function relativeTimeLabel(value: string) {
  const diffMinutes = Math.max(Math.floor((Date.now() - Date.parse(value)) / 60_000), 0);

  if (diffMinutes < 1) {
    return "방금 전";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  }
  if (diffMinutes < 24 * 60) {
    return `${Math.floor(diffMinutes / 60)}시간 전`;
  }

  return formatShortTime(value);
}

function formatActivityValue(log: LogCard) {
  if (log.type === "SLEEP" && log.recordedEndAt == null) {
    return `${log.value} 시작`;
  }

  return log.value;
}

function formatFeedingValue(log: LogCard | null) {
  if (!log) {
    return "-";
  }

  const metric = feedingMetricForLog(log);
  return metric ? formatFeedingMetric(metric) : log.value || "기록";
}

function iconForLogType(type: LogType): RecordIconName {
  switch (type) {
    case "FEEDING":
      return "feeding";
    case "SLEEP":
      return "sleep";
    case "GROWTH":
      return "temperature";
    case "MEDICINE":
      return "medicine";
    case "CHECKLIST":
    case "DIAPER":
      return "diaper";
    case "PUMPING":
      return "pumping";
    case "MOMENT":
    case "MEMO":
      return "memo";
    case "TEMPERATURE":
      return "temperature";
  }
}

const styles = StyleSheet.create({
  dashboardStack: {
    gap: 16,
  },
  homeHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  childIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  childCopy: {
    flex: 1,
    gap: 2,
  },
  childName: {
    color: "#111827",
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
  },
  childDay: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  alertDot: {
    position: "absolute",
    top: 5,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#4DB6AC",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  sectionHeaderInline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  taskSectionTitleWrap: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  taskCount: {
    color: "#278D84",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  taskHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  taskAddButton: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B7E2DB",
    backgroundColor: "#F1FAF8",
  },
  taskAddButtonText: {
    color: "#278D84",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  sectionTitle: {
    color: "#26364D",
    fontSize: 16,
    fontWeight: "700",
  },
  linkText: {
    color: "#4DB6AC",
    fontSize: 12,
    fontWeight: "700",
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusCard: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 86,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E9EEF6",
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 9,
    gap: 6,
    boxShadow: "0px 7px 16px rgba(15, 23, 42, 0.045)",
  },
  statusTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  statusIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  statusMetric: {
    flex: 1,
    alignItems: "flex-start",
    gap: 3,
  },
  statusLabel: {
    color: "#2B3E55",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  statusCaption: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  statusValue: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  recentSection: {
    gap: 8,
  },
  photoAlbumSection: {
    gap: 10,
    paddingBottom: 4,
  },
  photoAlbumGrid: {
    flexDirection: "row",
    gap: 8,
  },
  photoAlbumTile: {
    flex: 1,
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E3ECEA",
    backgroundColor: "#F2F7F7",
  },
  photoAlbumImage: {
    width: "100%",
    height: "100%",
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5EDE9",
    padding: 14,
    gap: 12,
    boxShadow: "0px 10px 22px rgba(15, 23, 42, 0.035)",
  },
  activityRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    paddingVertical: 6,
  },
  activityCopy: {
    flex: 1,
    gap: 1,
  },
  activityTitle: {
    color: "#2B3E55",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  activityMeta: {
    color: "#94A3B8",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  activityValueWrap: {
    minWidth: 102,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
  },
  activityValue: {
    color: "#334155",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  taskCard: {
    gap: 10,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E9EFF8",
    padding: 14,
  },
  taskMeta: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  taskTitle: {
    color: "#2B3E55",
    fontSize: 17,
    fontWeight: "700",
  },
  taskBody: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
  },
  taskReminder: {
    color: "#4DB6AC",
    fontSize: 12,
    fontWeight: "600",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  modalKeyboard: {
    width: "100%",
    maxWidth: 390,
    alignSelf: "center",
    justifyContent: "center",
  },
  modalCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DCE9E6",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.2)",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8F0ED",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  modalTitle: {
    color: "#26364D",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  modalSubtitle: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  modalCloseButton: {
    minWidth: 36,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    color: "#4DB6AC",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  modalContent: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: "#E8F0ED",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  modalHint: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
  },
  reminderInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reminderInput: {
    flex: 1,
  },
  reminderInputSuffix: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
});
