import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { RecordIcon } from "./RecordIcon";
import {
  addDays,
  addMonths,
  endOfWeek,
  formatDateKey,
  formatDateRangeLabel,
  formatStatsRangeLabel,
  shiftDateByPeriod,
  startOfWeek,
  type CalendarPeriod,
  type DateRange,
} from "./calendarDateUtils";

export {
  addDays,
  addMonths,
  endOfWeek,
  formatDateKey,
  formatDateRangeLabel,
  formatStatsRangeLabel,
  shiftDateByPeriod,
  startOfWeek,
} from "./calendarDateUtils";
export type { CalendarPeriod, DateRange } from "./calendarDateUtils";

export type CalendarPickerMode = "date" | "month";
export type CalendarSelectionMode = "single" | "range" | "week";
type CalendarPickerView = "date" | "month" | "year";

export const defaultStatsDate = new Date();

const primary = "#4DB6AC";
const text = "#111827";
const muted = "#6B7280";
const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

export function CalendarDatePickerOverlay({
  visible,
  selectedDate,
  displayMonth,
  mode = "date",
  selectionMode = "single",
  selectedRange,
  title = "날짜 선택",
  testID,
  onClose,
  onSelectDate,
  onSelectRange,
  onDisplayMonthChange,
  footer,
}: {
  visible: boolean;
  selectedDate: Date;
  displayMonth: Date;
  mode?: CalendarPickerMode;
  selectionMode?: CalendarSelectionMode;
  selectedRange?: DateRange;
  title?: string;
  testID: string;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
  onSelectRange?: (range: DateRange) => void;
  onDisplayMonthChange: (date: Date) => void;
  footer?: ReactNode;
}) {
  const [viewMode, setViewMode] = useState<CalendarPickerView>(mode);
  const [rangeDraftStart, setRangeDraftStart] = useState<Date | null>(null);

  useEffect(() => {
    if (visible) {
      setViewMode(mode);
      setRangeDraftStart(null);
    }
  }, [mode, visible]);

  const cells = buildCalendarCells(displayMonth);
  const yearPageStart = Math.floor(displayMonth.getFullYear() / 10) * 10;
  const navStep = viewMode === "date" ? 1 : viewMode === "month" ? 12 : 120;
  const navLabel =
    viewMode === "date"
      ? `${displayMonth.getFullYear()}년 ${displayMonth.getMonth() + 1}월`
      : viewMode === "month"
        ? `${displayMonth.getFullYear()}년`
        : `${yearPageStart}년 - ${yearPageStart + 11}년`;

  function handleHeaderPress() {
    if (viewMode === "date") {
      setViewMode("month");
      return;
    }

    if (viewMode === "month") {
      setViewMode("year");
    }
  }

  function handleSelectMonth(monthIndex: number) {
    const monthDate = new Date(displayMonth.getFullYear(), monthIndex, 1);

    if (mode === "month") {
      onSelectDate(monthDate);
      return;
    }

    onDisplayMonthChange(monthDate);
    setViewMode("date");
  }

  function handleSelectYear(year: number) {
    onDisplayMonthChange(new Date(year, displayMonth.getMonth(), 1));
    setViewMode("month");
  }

  function handleSelectDate(date: Date) {
    if (selectionMode === "week") {
      const range = {
        startDate: startOfWeek(date),
        endDate: endOfWeek(date),
      };
      if (onSelectRange) {
        onSelectRange(range);
      } else {
        onSelectDate(range.endDate);
      }
      return;
    }

    if (selectionMode !== "range") {
      onSelectDate(date);
      return;
    }

    if (!rangeDraftStart) {
      setRangeDraftStart(date);
      return;
    }

    const range = normalizeDateRange(rangeDraftStart, date);
    if (onSelectRange) {
      onSelectRange(range);
    } else {
      onSelectDate(range.endDate);
    }
    setRangeDraftStart(null);
  }

  const visibleRange =
    selectionMode === "week"
      ? selectedRange ?? { startDate: startOfWeek(selectedDate), endDate: endOfWeek(selectedDate) }
      : rangeDraftStart
        ? { startDate: rangeDraftStart, endDate: rangeDraftStart }
        : selectedRange;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay} testID={`${testID}-overlay`}>
        <Pressable style={styles.backdrop} onPress={onClose} testID={`${testID}-backdrop`} />
        <View style={styles.panel} testID={testID}>
          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={styles.panelContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.titleRow}>
              <RecordIcon name="calendar" size={16} color={primary} strokeWidth={2.1} />
              <Text style={styles.title}>{title}</Text>
            </View>
            <View style={styles.pickerNavRow}>
              <Pressable
                style={styles.navButton}
                onPress={() => onDisplayMonthChange(addMonths(displayMonth, -navStep))}
                testID={`${testID}-${viewMode === "date" ? "prev-month" : viewMode === "month" ? "prev-year" : "prev-year-page"}`}
              >
                <RecordIcon name="back-arrow" size={18} color="#334155" strokeWidth={2.1} />
              </Pressable>
              <Pressable
                style={styles.navLabelButton}
                onPress={handleHeaderPress}
                disabled={viewMode === "year"}
                accessibilityRole="button"
                testID={`${testID}-view-toggle`}
              >
                <Text style={styles.navLabelText}>{navLabel}</Text>
                {viewMode === "year" ? null : (
                  <RecordIcon name="chevron-down" size={16} color="#64748B" strokeWidth={2.2} />
                )}
              </Pressable>
              <Pressable
                style={styles.navButton}
                onPress={() => onDisplayMonthChange(addMonths(displayMonth, navStep))}
                testID={`${testID}-${viewMode === "date" ? "next-month" : viewMode === "month" ? "next-year" : "next-year-page"}`}
              >
                <RecordIcon name="next-arrow" size={18} color="#334155" strokeWidth={2.1} />
              </Pressable>
            </View>
            {viewMode === "year" ? (
              <View style={styles.yearGrid}>
                {Array.from({ length: 12 }, (_, index) => {
                  const year = yearPageStart + index;
                  const selected = selectedDate.getFullYear() === year;

                  return (
                    <Pressable
                      key={year}
                      style={[styles.yearCell, selected && styles.yearCellSelected]}
                      onPress={() => handleSelectYear(year)}
                      testID={`${testID}-year-${year}`}
                    >
                      <Text style={[styles.yearCellText, selected && styles.yearCellTextSelected]}>{year}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : viewMode === "month" ? (
              <View style={styles.monthGrid}>
                {Array.from({ length: 12 }, (_, monthIndex) => {
                  const selected =
                    selectedDate.getFullYear() === displayMonth.getFullYear() &&
                    selectedDate.getMonth() === monthIndex &&
                    mode === "month";

                  return (
                    <Pressable
                      key={monthIndex}
                      style={[styles.monthCell, selected && styles.monthCellSelected]}
                      onPress={() => handleSelectMonth(monthIndex)}
                      testID={`${testID}-month-${displayMonth.getFullYear()}-${`${monthIndex + 1}`.padStart(2, "0")}`}
                    >
                      <Text style={[styles.monthCellText, selected && styles.monthCellTextSelected]}>
                        {monthIndex + 1}월
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <>
                {selectionMode === "range" ? (
                  <View style={styles.rangeStatus} testID={`${testID}-range-status`}>
                    <Text style={styles.rangeStatusText}>
                      {rangeDraftStart ? `${formatShortDate(rangeDraftStart)} 시작 · 종료일 선택` : "시작일 선택"}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.weekdayRow}>
                  {weekdays.map((weekday) => (
                    <Text key={weekday} style={styles.weekdayText}>
                      {weekday}
                    </Text>
                  ))}
                </View>
                <View style={styles.dayGrid}>
                  {cells.map((cell) => {
                    const rangeBoundary =
                      selectionMode !== "single" &&
                      visibleRange &&
                      (isSameDay(cell.date, visibleRange.startDate) || isSameDay(cell.date, visibleRange.endDate));
                    const rangeStart =
                      selectionMode !== "single" && visibleRange && isSameDay(cell.date, visibleRange.startDate);
                    const rangeEnd =
                      selectionMode !== "single" && visibleRange && isSameDay(cell.date, visibleRange.endDate);
                    const selected = selectionMode !== "single" ? Boolean(rangeBoundary) : isSameDay(cell.date, selectedDate);
                    const inRange =
                      selectionMode !== "single" &&
                      visibleRange &&
                      isDateInRange(cell.date, visibleRange.startDate, visibleRange.endDate) &&
                      !rangeBoundary;
                    const today = isSameDay(cell.date, defaultStatsDate);
                    return (
                      <Pressable
                        key={formatDateKey(cell.date)}
                        style={[
                          styles.dayCell,
                          inRange && styles.dayCellInRange,
                          selected && styles.dayCellSelected,
                          rangeStart && !rangeEnd && styles.dayCellRangeStart,
                          rangeEnd && !rangeStart && styles.dayCellRangeEnd,
                          rangeStart && rangeEnd && styles.dayCellRangeSingle,
                          !cell.inMonth && styles.dayCellMuted,
                        ]}
                        onPress={() => handleSelectDate(cell.date)}
                        testID={`${testID}-day-${formatDateKey(cell.date)}`}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            !cell.inMonth && styles.dayTextMuted,
                            inRange && styles.dayTextInRange,
                            today && styles.dayTextToday,
                            selected && styles.dayTextSelected,
                          ]}
                        >
                          {cell.date.getDate()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            {footer}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function buildCalendarCells(displayMonth: Date) {
  const firstOfMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
  const diffToMonday = firstOfMonth.getDay() === 0 ? -6 : 1 - firstOfMonth.getDay();
  const firstCell = addDays(firstOfMonth, diffToMonday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(firstCell, index);
    return {
      date,
      inMonth: date.getMonth() === displayMonth.getMonth(),
    };
  });
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function normalizeDateRange(left: Date, right: Date): DateRange {
  if (left.getTime() <= right.getTime()) {
    return { startDate: left, endDate: right };
  }

  return { startDate: right, endDate: left };
}

function isDateInRange(date: Date, startDate: Date, endDate: Date) {
  const time = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();

  return time >= start && time <= end;
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 28,
    zIndex: 50,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    zIndex: 0,
  },
  panel: {
    width: "100%",
    maxWidth: 358,
    maxHeight: "92%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDE7FF",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    zIndex: 1,
    boxShadow: "0 14px 30px rgba(15, 23, 42, 0.14)",
  },
  panelScroll: {
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  panelContent: {
    gap: 10,
    padding: 12,
    backgroundColor: "#FFFFFF",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  title: {
    color: text,
    fontSize: 13,
    fontWeight: "700",
  },
  pickerNavRow: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  navButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  navLabelButton: {
    flex: 1,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  navLabelText: {
    color: text,
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  yearGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  yearCell: {
    width: "31.5%",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5EAF4",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  yearCellSelected: {
    borderColor: primary,
    backgroundColor: primary,
  },
  yearCellText: {
    color: text,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  yearCellTextSelected: {
    color: "#FFFFFF",
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  monthCell: {
    width: "31.5%",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5EAF4",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  monthCellSelected: {
    borderColor: primary,
    backgroundColor: primary,
  },
  monthCellText: {
    color: text,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  monthCellTextSelected: {
    color: "#FFFFFF",
  },
  weekdayRow: {
    flexDirection: "row",
  },
  weekdayText: {
    flex: 1,
    color: muted,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
  },
  rangeStatus: {
    minHeight: 30,
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
  },
  rangeStatusText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 6,
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  dayCellSelected: {
    backgroundColor: primary,
  },
  dayCellInRange: {
    backgroundColor: "#E7F6F3",
    borderRadius: 0,
  },
  dayCellRangeStart: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  dayCellRangeEnd: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  dayCellRangeSingle: {
    borderRadius: 8,
  },
  dayCellMuted: {
    opacity: 0.42,
  },
  dayText: {
    color: text,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  dayTextMuted: {
    color: "#94A3B8",
  },
  dayTextInRange: {
    color: primary,
  },
  dayTextToday: {
    color: primary,
    fontWeight: "700",
  },
  dayTextSelected: {
    color: "#FFFFFF",
  },
});
