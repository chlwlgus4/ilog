export type CalendarPeriod = "daily" | "weekly" | "monthly";
export type DateRange = {
  startDate: Date;
  endDate: Date;
};

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatStatsRangeLabel(period: CalendarPeriod, date: Date) {
  if (period === "monthly") {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
  }

  if (period === "weekly") {
    const start = startOfWeek(date);
    const end = endOfWeek(date);
    return `${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getMonth() + 1}월 ${end.getDate()}일`;
  }

  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function formatDateRangeLabel(startDate: Date, endDate: Date) {
  return `${startDate.getMonth() + 1}월 ${startDate.getDate()}일 ~ ${endDate.getMonth() + 1}월 ${endDate.getDate()}일`;
}

export function shiftDateByPeriod(date: Date, period: CalendarPeriod, direction: -1 | 1) {
  if (period === "monthly") {
    return addMonths(date, direction);
  }

  return addDays(date, period === "weekly" ? 7 * direction : direction);
}

export function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function addMonths(date: Date, amount: number) {
  const nextMonthStart = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(nextMonthStart.getFullYear(), nextMonthStart.getMonth() + 1, 0).getDate();
  return new Date(nextMonthStart.getFullYear(), nextMonthStart.getMonth(), Math.min(date.getDate(), lastDay));
}

export function startOfWeek(date: Date) {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(date, diffToMonday);
}

export function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}
