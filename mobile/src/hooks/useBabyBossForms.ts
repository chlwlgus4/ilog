import { useState } from "react";

import type { LogType, ScheduleCategory, TaskPriority } from "../api";
import { roleDefaultNickname, toDateTimeValue } from "../constants";
import type {
  JoinFormState,
  LogFormState,
  LoginFormState,
  MemoryFormState,
  ScheduleFormState,
  TaskFormState,
} from "./babyBossAppTypes";

function createInitialLoginForm(): LoginFormState {
  return { email: "", password: "" };
}

function createInitialJoinForm(inviteCode = ""): JoinFormState {
  return {
    inviteCode,
    email: "",
    caregiverName: roleDefaultNickname.GUARDIAN,
    role: "GUARDIAN",
    password: "",
  };
}

function createInitialTaskForm(): TaskFormState {
  return {
    title: "",
    description: "",
    dueAt: toDateTimeValue(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    priority: "MEDIUM" as TaskPriority,
    assigneeId: "auto",
    reminderAfterMinutes: "",
    notificationRecipientIds: [],
  };
}

function createInitialLogForm(): LogFormState {
  return {
    type: "MEMO" as LogType,
    value: "",
    note: "",
    recordedAt: toDateTimeValue(new Date()),
  };
}

function createInitialScheduleForm(): ScheduleFormState {
  return {
    title: "",
    category: "HOME" as ScheduleCategory,
    startAt: toDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    endAt: toDateTimeValue(new Date(Date.now() + 25 * 60 * 60 * 1000)),
    note: "",
  };
}

function createInitialMemoryForm(): MemoryFormState {
  return {
    title: "",
    note: "",
    imageUrl: "",
    tag: "",
    happenedAt: toDateTimeValue(new Date()),
  };
}

export function useBabyBossForms() {
  const [loginForm, setLoginForm] = useState<LoginFormState>(createInitialLoginForm);
  const [joinForm, setJoinForm] = useState<JoinFormState>(() => createInitialJoinForm());
  const [taskForm, setTaskForm] = useState<TaskFormState>(createInitialTaskForm);
  const [logForm, setLogForm] = useState<LogFormState>(createInitialLogForm);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(createInitialScheduleForm);
  const [memoryForm, setMemoryForm] = useState<MemoryFormState>(createInitialMemoryForm);
  const [chatBody, setChatBody] = useState("");

  function resetJoinForm(inviteCode = joinForm.inviteCode) {
    setJoinForm(createInitialJoinForm(inviteCode));
  }

  function resetTaskForm() {
    setTaskForm(createInitialTaskForm());
  }

  function resetLogForm() {
    setLogForm(createInitialLogForm());
  }

  function resetScheduleForm() {
    setScheduleForm(createInitialScheduleForm());
  }

  function resetMemoryForm() {
    setMemoryForm(createInitialMemoryForm());
  }

  return {
    loginForm,
    setLoginForm,
    joinForm,
    setJoinForm,
    taskForm,
    setTaskForm,
    logForm,
    setLogForm,
    scheduleForm,
    setScheduleForm,
    memoryForm,
    setMemoryForm,
    chatBody,
    setChatBody,
    resetJoinForm,
    resetTaskForm,
    resetLogForm,
    resetScheduleForm,
    resetMemoryForm,
  };
}

export type UseBabyBossFormsResult = ReturnType<typeof useBabyBossForms>;
