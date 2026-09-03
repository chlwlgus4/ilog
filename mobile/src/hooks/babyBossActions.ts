import {
  completeTask,
  createChatMessage,
  createChildProfile,
  createLog,
  createMemory,
  createSchedule,
  createTask,
  createTimelineComment,
  completeEmailAuth,
  completeGoogleAuth,
  joinFamily,
  login,
  logout,
  startAppleAuth,
  startGoogleAuth,
  upsertRecordAlarmRule,
  updateCaregiverProfile,
  updateSettings,
  type CreateChildProfileRequest,
  type FamilySettingsSummary,
  type UpdateCaregiverProfileRequest,
} from "../api";
import { currentLegalConsent, type LegalConsentVersions } from "../legalDocuments";
import { toDateTimeValue } from "../constants";
import { showAppAlert } from "../features/shared/appAlerts";
import { missingDefaultRecordReminders } from "../features/shared/recordReminderDefaults";
import {
  clearLoginAttempts,
  getLoginAttemptStatus,
  isInvalidLoginError,
  loginLockMessage,
  recordInvalidLoginAttempt,
} from "../features/auth/authRequestLimiter";
import {
  registerPushDeviceToken,
  requestPushNotificationPermission,
} from "../serverless/pushNotifications";
import type { OAuthSignupProfile } from "../features/auth/oauthSignupProfile";
import type { UseBabyBossFormsResult } from "./useBabyBossForms";
import type { UseBabyBossRuntimeResult } from "./useBabyBossRuntime";

export function createBabyBossActions(runtime: UseBabyBossRuntimeResult, forms: UseBabyBossFormsResult) {
  function validateEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  function validatePassword(value: string) {
    return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
  }

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

  async function handleLogin(captchaToken: string, inviteCode?: string) {
    if (!validateEmail(forms.loginForm.email) || !forms.loginForm.password) {
      runtime.setError("이메일과 비밀번호를 확인해 주세요.");
      return false;
    }

    const attemptStatus = getLoginAttemptStatus(forms.loginForm.email);
    if (!attemptStatus.allowed) {
      runtime.setError(loginLockMessage(attemptStatus.remainingMs));
      return false;
    }

    return runAction("login", "로그인에 실패했어요.", async () => {
      try {
        const nextSession = await login({
          ...forms.loginForm,
          captchaToken,
          ...(inviteCode?.trim() ? { inviteCode } : {}),
        });
        clearLoginAttempts(forms.loginForm.email);
        await runtime.hydrate(nextSession, undefined, true);
        forms.resetJoinForm();
        runtime.setActiveTab("dashboard");
      } catch (error) {
        if (isInvalidLoginError(error)) {
          const nextAttemptStatus = recordInvalidLoginAttempt(forms.loginForm.email);
          if (!nextAttemptStatus.allowed) {
            throw new Error(loginLockMessage(nextAttemptStatus.remainingMs));
          }
        }

        throw error;
      }
    });
  }

  async function handleJoin(captchaToken: string) {
    if (!validateEmail(forms.joinForm.email)) {
      runtime.setError("이메일 형식을 확인해 주세요.");
      return false;
    }

    if (!forms.joinForm.caregiverName.trim()) {
      runtime.setError("닉네임을 입력해 주세요.");
      return false;
    }

    if (!validatePassword(forms.joinForm.password)) {
      runtime.setError("비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.");
      return false;
    }

    if (!forms.joinForm.termsAccepted || !forms.joinForm.privacyAccepted) {
      runtime.setError("이용약관과 개인정보 처리방침에 모두 동의해 주세요.");
      return false;
    }

    return runAction("join", "보호자 등록에 실패했어요.", async () => {
      const signup = await joinFamily({
        inviteCode: forms.joinForm.inviteCode,
        email: forms.joinForm.email,
        caregiverName: forms.joinForm.caregiverName,
        role: forms.joinForm.role,
        password: forms.joinForm.password,
        captchaToken,
        legalConsent: currentLegalConsent(),
      });

      if (!signup.session) {
        showAppAlert(
          "처음 가입한 이메일이면 확인 메일을 보내드렸어요. 메일의 확인 링크로 가입을 완료하면 입력한 초대 가족에 연결됩니다. 메일이 오지 않으면 이미 가입된 계정일 수 있으니 로그인하거나 비밀번호 찾기를 이용해 주세요.",
          "이메일을 확인해 주세요",
        );
        return;
      }

      await runtime.hydrate(signup.session, undefined, true);
      forms.resetJoinForm();
      runtime.setActiveTab("dashboard");
    });
  }

  async function handleGoogleAuth(
    inviteCode?: string,
    legalConsent?: LegalConsentVersions,
    signupProfile?: OAuthSignupProfile,
  ) {
    await runAction("google-auth", "Google 로그인에 실패했어요.", async () => {
      const nextSession = await startGoogleAuth({ inviteCode, legalConsent, signupProfile });

      if (nextSession) {
        await runtime.hydrate(nextSession, undefined, true);
        forms.resetJoinForm();
        runtime.setActiveTab("dashboard");
      }
    });
  }

  async function handleAppleAuth(
    inviteCode?: string,
    legalConsent?: LegalConsentVersions,
    signupProfile?: OAuthSignupProfile,
  ) {
    await runAction("apple-auth", "Apple 로그인에 실패했어요.", async () => {
      const nextSession = await startAppleAuth({ inviteCode, legalConsent, signupProfile });

      if (nextSession) {
        await runtime.hydrate(nextSession, undefined, true);
        forms.resetJoinForm();
        runtime.setActiveTab("dashboard");
      }
    });
  }

  async function handleLegalConsent() {
    return runAction("legal-consent", "약관 동의를 저장하지 못했어요.", async () => {
      await runtime.acceptLegalConsent();
    });
  }

  async function handleGoogleAuthCallback(callbackUrl?: string | null) {
    await runAction("google-auth-callback", "Google 로그인에 실패했어요.", async () => {
      const nextSession = await completeGoogleAuth(callbackUrl);
      await runtime.hydrate(nextSession, undefined, true);
      forms.resetJoinForm();
      runtime.setActiveTab("dashboard");
    });
  }

  async function handleEmailAuthCallback(callbackUrl?: string | null) {
    return runAction("email-auth-callback", "이메일 확인을 완료하지 못했어요.", async () => {
      const nextSession = await completeEmailAuth(callbackUrl);
      await runtime.hydrate(nextSession, undefined, true);
      forms.resetJoinForm();
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

  async function handleSettingsUpdate(patch: Partial<FamilySettingsSummary>) {
    const session = runtime.session;

    if (!session) {
      return;
    }

    await runAction("settings", "설정을 바꾸지 못했어요.", async () => {
      const enablesDevicePush =
        (patch.pushNotificationsEnabled === true && runtime.currentSettings?.pushNotificationsEnabled === false) ||
        (patch.chatNotificationsEnabled === true && runtime.currentSettings?.chatNotificationsEnabled === false);

      if (enablesDevicePush) {
        const permissionStatus = await requestPushNotificationPermission();
        if (permissionStatus === "denied") {
          throw new Error("기기 알림 권한을 허용한 뒤 다시 켜 주세요.");
        }
      }

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

      if (enablesDevicePush) {
        const registrationStatus = await registerPushDeviceToken(session);
        if (registrationStatus === "denied") {
          throw new Error("기기 알림 권한을 허용한 뒤 다시 켜 주세요.");
        }
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
      runtime.setBootstrap(null);
    }
  }

  return {
    handleLogin,
    handleJoin,
    handleGoogleAuth,
    handleAppleAuth,
    handleLegalConsent,
    handleGoogleAuthCallback,
    handleEmailAuthCallback,
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
