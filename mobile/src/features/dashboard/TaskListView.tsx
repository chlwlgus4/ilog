import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TaskCard } from "../../api";
import { formatShortTime, reminderLabel, statusLabel } from "../../constants";
import { EmptyCard } from "../../ui";
import { useAppAlert } from "../shared/appAlerts";
import { addDays, CalendarDatePickerOverlay } from "../shared/CalendarDatePicker";
import { RecordIcon } from "../shared/RecordIcon";

export function TaskListView({
  selectedDate,
  tasks,
  isLoading,
  error,
  busyAction,
  onBack,
  onAdd,
  onDateChange,
  onComplete,
}: {
  selectedDate: Date;
  tasks: TaskCard[];
  isLoading: boolean;
  error: string | null;
  busyAction: string | null;
  onBack: () => void;
  onAdd: () => void;
  onDateChange: (date: Date) => void;
  onComplete: (taskId: number) => void;
}) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(selectedDate);
  const dateLabel = useMemo(() => formatTaskDate(selectedDate), [selectedDate]);

  useAppAlert(error);

  useEffect(() => {
    setDisplayMonth(selectedDate);
  }, [selectedDate]);

  function selectDate(date: Date) {
    setDatePickerOpen(false);
    onDateChange(date);
  }

  return (
    <View style={styles.screen} testID="screen-task-assignments">
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={onBack} accessibilityRole="button" testID="back-분담-목록">
          <RecordIcon name="back-arrow" size={22} color="#26364D" strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>분담 목록</Text>
        <Pressable style={styles.headerButton} onPress={onAdd} accessibilityRole="button" accessibilityLabel="분담 추가" testID="task-list-add">
          <RecordIcon name="add-plus" size={22} color="#278D84" strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={styles.dateNavigator}>
        <Pressable
          style={styles.dateArrow}
          onPress={() => onDateChange(addDays(selectedDate, -1))}
          accessibilityRole="button"
          accessibilityLabel="이전 날짜"
          testID="task-list-prev-date"
        >
          <RecordIcon name="back-arrow" size={20} color="#4DB6AC" strokeWidth={2.4} />
        </Pressable>
        <Pressable
          style={styles.dateButton}
          onPress={() => setDatePickerOpen(true)}
          accessibilityRole="button"
          testID="task-list-date-picker-open"
        >
          <Text style={styles.dateButtonText}>{dateLabel}</Text>
          <RecordIcon name="calendar" size={18} color="#4DB6AC" strokeWidth={2.1} />
        </Pressable>
        <Pressable
          style={styles.dateArrow}
          onPress={() => onDateChange(addDays(selectedDate, 1))}
          accessibilityRole="button"
          accessibilityLabel="다음 날짜"
          testID="task-list-next-date"
        >
          <RecordIcon name="next-arrow" size={20} color="#4DB6AC" strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countTitle}>{isToday(selectedDate) ? "오늘의 분담" : "선택한 날짜의 분담"}</Text>
        <Text style={styles.countValue}>{tasks.length}건</Text>
      </View>

      {isLoading ? <EmptyCard message="분담 목록을 불러오는 중이에요." /> : null}
      {!isLoading && !error && tasks.length === 0 ? <EmptyCard message="이 날짜에 등록된 분담이 없어요." /> : null}
      {!isLoading && !error && tasks.length > 0 ? (
        <View style={styles.taskList}>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} busyAction={busyAction} onComplete={onComplete} />
          ))}
        </View>
      ) : null}

      <CalendarDatePickerOverlay
        visible={datePickerOpen}
        selectedDate={selectedDate}
        displayMonth={displayMonth}
        title="분담 날짜 선택"
        testID="task-list-date-picker"
        onClose={() => setDatePickerOpen(false)}
        onSelectDate={selectDate}
        onDisplayMonthChange={setDisplayMonth}
      />
    </View>
  );
}

function TaskRow({
  task,
  busyAction,
  onComplete,
}: {
  task: TaskCard;
  busyAction: string | null;
  onComplete: (taskId: number) => void;
}) {
  const reminder = task.reminderAfterMinutes != null
    ? `${task.reminderAfterMinutes}분 뒤 알림`
    : task.reminderMinutesBefore != null
      ? `마감 ${reminderLabel(task.reminderMinutesBefore)}`
      : null;

  return (
    <View style={styles.taskRow} testID={`task-list-row-${task.id}`}>
      <View style={styles.taskTopLine}>
        <Text style={styles.taskTime}>{formatShortTime(task.dueAt)}</Text>
        <View style={styles.taskTopActions}>
          <View style={[styles.statusPill, task.status === "DONE" && styles.statusPillDone]}>
            <Text style={[styles.statusPillText, task.status === "DONE" && styles.statusPillTextDone]}>{statusLabel[task.status]}</Text>
          </View>
          {task.status !== "DONE" ? (
            <Pressable
              style={[styles.completeButton, busyAction === `complete-${task.id}` && styles.completeButtonDisabled]}
              onPress={() => onComplete(task.id)}
              disabled={busyAction === `complete-${task.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${task.title} 종료 처리`}
              testID={`task-list-complete-${task.id}`}
            >
              <RecordIcon name="confirm-check" size={13} color="#278D84" strokeWidth={2.5} />
              <Text style={styles.completeButtonText}>{busyAction === `complete-${task.id}` ? "종료 중" : "종료"}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text style={styles.taskTitle}>{task.title}</Text>
      <Text style={styles.taskMeta}>{task.assigneeName} 담당{task.autoAssigned ? " · 자동 배정" : ""}</Text>
      {task.description ? <Text style={styles.taskDescription}>{task.description}</Text> : null}
      {reminder ? <Text style={styles.taskReminder}>{reminder}</Text> : null}
    </View>
  );
}

function isToday(date: Date) {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function formatTaskDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

const styles = StyleSheet.create({
  screen: {
    gap: 18,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 36,
  },
  header: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#111827",
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
  },
  dateNavigator: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dateArrow: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  dateButton: {
    minWidth: 0,
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
  },
  dateButtonText: {
    color: "#26364D",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  countRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E5EDE9",
    paddingBottom: 12,
  },
  countTitle: {
    color: "#26364D",
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
  },
  countValue: {
    color: "#4DB6AC",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  taskList: {
    gap: 10,
  },
  taskRow: {
    gap: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E3ECE8",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  taskTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  taskTopActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  taskTime: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: "#EDF8F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillDone: {
    backgroundColor: "#EEF2F7",
  },
  statusPillText: {
    color: "#278D84",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  statusPillTextDone: {
    color: "#64748B",
  },
  completeButton: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A8D9D1",
    backgroundColor: "#F5FBFA",
    paddingHorizontal: 8,
  },
  completeButtonDisabled: {
    opacity: 0.55,
  },
  completeButtonText: {
    color: "#278D84",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },
  taskTitle: {
    color: "#26364D",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  taskMeta: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  taskDescription: {
    color: "#7B8798",
    fontSize: 13,
    lineHeight: 19,
  },
  taskReminder: {
    color: "#278D84",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
});
