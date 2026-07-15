import {
  completeTask,
  createChatMessage,
  createChildProfile,
  createLog,
  createMemory,
  createSchedule,
  createTask,
  createTimelineComment,
  completeGoogleAuth,
  fetchBootstrap,
  joinFamily,
  login,
  logout,
  startGoogleAuth,
  upsertRecordAlarmRule,
  updateCaregiverProfile,
  updateSettings,
  type CreateChildProfileRequest,
  type FamilySettingsSummary,
  type SubscriptionPlan,
  type UpdateCaregiverProfileRequest,
} from "../api";
import { toDateTimeValue } from "../constants";
import { missingDefaultRecordReminders } from "../features/shared/recordReminderDefaults";
import type { UseBabyBossFormsResult } from "./useBabyBossForms";
import type { UseBabyBossRuntimeResult } from "./useBabyBossRuntime";

export function createBabyBossActions(runtime: UseBabyBossRuntimeResult, forms: UseBabyBossFormsResult) {
  async function runAction(action: string, fallbackMessage: string, work: () => Promise<void>) {
    try {
      runtime.setBusyAction(action);
      runtime.setError(null);
      await work();
      return true;
    } catch (submitError) {
      runtime.setError(submitError instanceof Error ? submitError.message : fallbackMessage);
      return false;
    } finally {
      runtime.setBusyAction(null);
    }
  }

  async function handleLogin() {
    await runAction("login", "로그인에 실패했어요.", async () => {
      const nextSession = await login(forms.loginForm);
      await runtime.hydrate(nextSession);
      runtime.setActiveTab("dashboard");
    });
  }

  async function handleJoin() {
    await runAction("join", "보호자 등록에 실패했어요.", async () => {
      const nextSession = await joinFamily({
        inviteCode: forms.joinForm.inviteCode,
        email: forms.joinForm.email,
        caregiverName: forms.joinForm.caregiverName,
        role: forms.joinForm.role,
        password: forms.joinForm.password,
      });
      await runtime.hydrate(nextSession);
      forms.resetJoinForm(forms.joinForm.inviteCode);
      runtime.setActiveTab("dashboard");
    });
  }

  async function handleGoogleAuth(inviteCode?: string) {
    await runAction("google-auth", "Google 로그인에 실패했어요.", async () => {
      await startGoogleAuth({ inviteCode });
    });
  }

  async function handleGoogleAuthCallback(callbackUrl?: string | null) {
    await runAction("google-auth-callback", "Google 로그인에 실패했어요.", async () => {
      const nextSession = await completeGoogleAuth(callbackUrl);
      await runtime.hydrate(nextSession);
      runtime.setActiveTab("dashboard");
    });
  }

  async function handleTask(): Promise<boolean> {
    const session = runtime.session;

    if (!session?.child) {
      runtime.setError("아이 정보를 먼저 입력해 주세요.");
      return false;
    }
    const child = session.child;
    const reminderAfterMinutes = parseTaskReminderMinutes(forms.taskForm.reminderAfterMinutes);

    if (reminderAfterMinutes === undefined) {
      runtime.setError("알림 시간은 1분에서 1,440분 사이의 정수로 입력해 주세요.");
      return false;
    }

    const dueAt = reminderAfterMinutes == null
      ? forms.taskForm.dueAt
      : toDateTimeValue(new Date(Date.now() + reminderAfterMinutes * 60_000));
    const notificationRecipientIds = Array.from(
      new Set(
        forms.taskForm.notificationRecipientIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );

    return runAction("task", "할 일을 저장하지 못했어요.", async () => {
      await createTask(session.family.id, {
        title: forms.taskForm.title,
        description: forms.taskForm.description,
        childId: child.id,
        assigneeId: forms.taskForm.assigneeId === "auto" ? null : Number(forms.taskForm.assigneeId),
        dueAt,
        priority: forms.taskForm.priority,
        reminderMinutesBefore: null,
        reminderAfterMinutes,
        notificationRecipientIds,
      });
      await Promise.all([runtime.refreshDashboard(), runtime.refreshChat()]);
      forms.resetTaskForm();
    });
  }

  async function handleComplete(taskId: number) {
    const session = runtime.session;

    if (!session) {
      return;
    }

    await runAction(`complete-${taskId}`, "할 일 상태를 바꾸지 못했어요.", async () => {
      await completeTask(taskId);
      await Promise.all([runtime.refreshDashboard(), runtime.refreshChat()]);
    });
  }

  async function handleLog() {
    const session = runtime.session;

    if (!session?.child) {
      runtime.setError("아이 정보를 먼저 입력해 주세요.");
      return;
    }
    const child = session.child;

    await runAction("log", "생활 기록을 저장하지 못했어요.", async () => {
      await createLog(session.family.id, {
        type: forms.logForm.type,
        value: forms.logForm.value,
        note: forms.logForm.note,
        childId: child.id,
        recordedAt: forms.logForm.recordedAt,
      });
      await Promise.all([runtime.refreshDashboard(), runtime.refreshChat()]);
      forms.resetLogForm();
    });
  }

  async function handleChat() {
    const session = runtime.session;

    if (!session) {
      return;
    }

    await runAction("chat", "메시지를 보내지 못했어요.", async () => {
      await createChatMessage(session.family.id, {
        body: forms.chatBody,
        messageType: "TEXT",
      });
      await Promise.all([runtime.refreshChat(), runtime.refreshDashboard()]);
      forms.setChatBody("");
    });
  }

  async function handleTimelineComment(messageId: number, body: string, parentCommentId?: number | null) {
    const session = runtime.session;

    if (!session) {
      return;
    }

    await runAction(`timeline-comment-${messageId}-${parentCommentId ?? 0}`, "댓글을 저장하지 못했어요.", async () => {
      const comment = await createTimelineComment(session.family.id, {
        messageId,
        parentCommentId: parentCommentId ?? null,
        body,
      });
      runtime.applyTimelineComment(comment);
    });
  }

  async function handleSchedule() {
    const session = runtime.session;

    if (!session?.child) {
      runtime.setError("아이 정보를 먼저 입력해 주세요.");
      return;
    }
    const child = session.child;

    await runAction("schedule", "일정을 저장하지 못했어요.", async () => {
      await createSchedule(session.family.id, {
        title: forms.scheduleForm.title,
        category: forms.scheduleForm.category,
        childId: child.id,
        startAt: forms.scheduleForm.startAt,
        endAt: forms.scheduleForm.endAt,
        note: forms.scheduleForm.note,
      });
      await Promise.all([runtime.refreshNotebook(), runtime.refreshDashboard(), runtime.refreshChat()]);
      forms.resetScheduleForm();
    });
  }

  async function handleMemory() {
    const session = runtime.session;

    if (!session?.child) {
      runtime.setError("아이 정보를 먼저 입력해 주세요.");
      return;
    }
    const child = session.child;

    await runAction("memory", "기억을 저장하지 못했어요.", async () => {
      await createMemory(session.family.id, {
        title: forms.memoryForm.title,
        note: forms.memoryForm.note,
        imageUrl: forms.memoryForm.imageUrl,
        tag: forms.memoryForm.tag,
        childId: child.id,
        happenedAt: forms.memoryForm.happenedAt,
      });
      await Promise.all([runtime.refreshNotebook(), runtime.refreshChat(), runtime.refreshDashboard()]);
      forms.resetMemoryForm();
    });
  }

  async function handleSettingsUpdate(patch: Partial<FamilySettingsSummary> & { subscriptionPlan?: SubscriptionPlan }) {
    const session = runtime.session;

    if (!session) {
      return;
    }

    await runAction("settings", "설정을 바꾸지 못했어요.", async () => {
      const nextSettings = await updateSettings(session.family.id, patch);
      const shouldSeedRecordReminderDefaults =
        patch.pushNotificationsEnabled === true && runtime.currentSettings?.pushNotificationsEnabled === false;

      if (shouldSeedRecordReminderDefaults) {
        const defaults = missingDefaultRecordReminders(session.family.id, nextSettings.recordAlarmRules);
        const persistedDefaults = await Promise.all(
          defaults.map((rule) =>
            upsertRecordAlarmRule(session.family.id, {
              logType: rule.logType,
              enabled: rule.enabled,
              intervalMinutes: rule.intervalMinutes,
              notifyScope: rule.notifyScope,
            }),
          ),
        );
        const persistedByType = new Map(persistedDefaults.map((rule) => [rule.logType, rule]));

        runtime.applySettings({
          ...nextSettings,
          recordAlarmRules: nextSettings.recordAlarmRules.map((rule) => persistedByType.get(rule.logType) ?? rule),
        });
      } else {
        runtime.applySettings(nextSettings);
      }
      await runtime.refreshDashboard();
    });
  }

  async function handleCaregiverProfileUpdate(payload: UpdateCaregiverProfileRequest) {
    const session = runtime.session;

    if (!session) {
      return;
    }

    await runAction("profile", "프로필을 저장하지 못했어요.", async () => {
      const caregiver = await updateCaregiverProfile(session.caregiver.id, payload);
      runtime.applyCaregiverProfile(caregiver);
      await runtime.refreshDashboard();
    });
  }

  async function handleCreateChildProfile(payload: CreateChildProfileRequest) {
    const session = runtime.session;

    if (!session) {
      return;
    }

    await runAction("child-profile", "아이 정보를 저장하지 못했어요.", async () => {
      await createChildProfile(session.family.id, payload);
      await runtime.refreshAll();
    });
  }

  async function handleLogout() {
    const session = runtime.session;

    if (!session) {
      return;
    }

    try {
      runtime.setBusyAction("logout");
      runtime.setError(null);
      await logout();
    } catch {
      // Ignore logout network failure and clear local state anyway.
    } finally {
      await runtime.clearLocalSession();
      runtime.setBusyAction(null);
      runtime.setBootstrap(await fetchBootstrap());
    }
  }

  return {
    handleLogin,
    handleJoin,
    handleGoogleAuth,
    handleGoogleAuthCallback,
    handleTask,
    handleComplete,
    handleLog,
    handleChat,
    handleTimelineComment,
    handleSchedule,
    handleMemory,
    handleSettingsUpdate,
    handleCaregiverProfileUpdate,
    handleCreateChildProfile,
    handleLogout,
  };
}

function parseTaskReminderMinutes(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const minutes = Number(trimmed);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : undefined;
}
