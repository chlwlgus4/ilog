import type { CaregiverRole, LogType, ScheduleCategory, TaskPriority } from "../api";

export type TabKey = "dashboard" | "chat" | "notebook" | "settings";

export interface LoginFormState {
  email: string;
  password: string;
}

export interface JoinFormState {
  inviteCode: string;
  email: string;
  caregiverName: string;
  role: CaregiverRole;
  password: string;
}

export interface TaskFormState {
  title: string;
  description: string;
  dueAt: string;
  priority: TaskPriority;
  assigneeId: string;
  reminderAfterMinutes: string;
  notificationRecipientIds: string[];
}

export interface LogFormState {
  type: LogType;
  value: string;
  note: string;
  recordedAt: string;
}

export interface ScheduleFormState {
  title: string;
  category: ScheduleCategory;
  startAt: string;
  endAt: string;
  note: string;
}

export interface MemoryFormState {
  title: string;
  note: string;
  imageUrl: string;
  tag: string;
  happenedAt: string;
}
