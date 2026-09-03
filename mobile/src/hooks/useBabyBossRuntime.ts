import { useEffect, useRef, useState, useTransition } from "react";
import { AppState } from "react-native";

import {
  acceptCurrentLegalConsent,
  fetchBootstrap,
  fetchChat,
  fetchDashboard,
  fetchFamilyChat,
  fetchGrowthMeasurements,
  fetchNotebook,
  fetchSettings,
  hasCurrentLegalConsent,
  restoreSession,
  type BootstrapResponse,
  type CaregiverSummary,
  type ChatResponse,
  type DashboardResponse,
  type FamilyChatMessageCard,
  type FamilyChatResponse,
  type GrowthMeasurementCard,
  type NotebookResponse,
  type SessionResponse,
  type SettingsResponse,
  type TimelineCommentCard,
} from "../api";
import { prependFamilyChatMessage } from "../features/chat/familyChatUtils";
import { subscribeFamilyChatMessages } from "../serverless/familyChatRealtime";
import {
  registerPushDeviceToken,
  resumePushRegistrationForAuthenticatedSession,
} from "../serverless/pushNotifications";
import { isTerminalSessionError } from "../serverless/sessionErrorPolicy";
import { invalidateFamilyMediaCache } from "../serverless/babyBossSupabaseApi";
import { refreshContentSafetyState, subscribeSafetyChanges } from "../serverless/safetyApi";
import { clearLegacyPreferences, clearSessionToken } from "../storage";
import type { TabKey } from "./babyBossAppTypes";

function normalizeLocalDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function chatQueryForDate(date: Date) {
  const start = normalizeLocalDate(date);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    limit: 80,
  };
}

export function useBabyBossRuntime() {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [chat, setChat] = useState<ChatResponse | null>(null);
  const [familyChat, setFamilyChat] = useState<FamilyChatResponse | null>(null);
  const [notebook, setNotebook] = useState<NotebookResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [growthMeasurements, setGrowthMeasurements] = useState<GrowthMeasurementCard[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [legalConsentRequired, setLegalConsentRequired] = useState(false);
  const [timelineDate, setTimelineDate] = useState(() => normalizeLocalDate(new Date()));
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [sessionRecoveryRequired, setSessionRecoveryRequired] = useState(false);
  const familyChatRequestVersion = useRef(0);
  const timelineTargetRequestVersion = useRef(0);
  const safetyRequestVersion = useRef(0);
  const hydrationRequestVersion = useRef(0);
  const activeSessionScope = useRef<{ caregiverId: number; familyId: number } | null>(null);
  const refreshFamilyChatRef = useRef<(nextSession?: SessionResponse | null) => Promise<void>>(async () => undefined);

  const currentFamily = session?.family ?? bootstrap?.family ?? null;
  const currentChild = session?.child ?? bootstrap?.child ?? null;
  const currentSettings = settings?.settings ?? session?.settings ?? bootstrap?.settings ?? null;

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    refreshFamilyChatRef.current = refreshFamilyChat;
  });

  useEffect(() => subscribeSafetyChanges((change) => {
    safetyRequestVersion.current += 1;
    const safetyVersion = safetyRequestVersion.current;
    familyChatRequestVersion.current += 1;
    timelineTargetRequestVersion.current += 1;
    invalidateFamilyMediaCache();
    // Clear old content immediately; a slow pre-block request must not put it back.
    setDashboard(null);
    setChat(null);
    setFamilyChat(null);
    setNotebook(null);
    setGrowthMeasurements([]);
    if (change.kind !== "auth-reset" && session?.child) {
      void Promise.all([
        refreshDashboard(session), refreshChat(session),
        refreshFamilyChat(session), refreshNotebook(session),
        fetchGrowthMeasurements(session.family.id).then((payload) => {
          if (safetyRequestVersion.current === safetyVersion) setGrowthMeasurements(payload);
        }),
      ]).catch(() => {
        if (safetyRequestVersion.current === safetyVersion) setError("안전 설정은 저장됐어요. 최신 내용을 다시 불러와 주세요.");
      });
    }
  }), [session?.caregiver.id, session?.family.id, session?.child?.id, timelineDate]);

  useEffect(() => {
    const familyId = session?.family.id;
    const caregiverId = session?.caregiver.id;

    if (familyId == null || caregiverId == null) {
      return undefined;
    }

    let active = true;
    let refreshInFlight = false;
    let refreshAgain = false;

    function refreshFromRealtime() {
      if (!active) {
        return;
      }
      if (refreshInFlight) {
        refreshAgain = true;
        return;
      }

      refreshInFlight = true;
      void refreshFamilyChatRef.current()
        .catch(() => {
          console.warn("Failed to refresh family chat from Realtime.");
        })
        .finally(() => {
          refreshInFlight = false;

          if (refreshAgain) {
            refreshAgain = false;
            refreshFromRealtime();
          }
        });
    }

    const unsubscribe = subscribeFamilyChatMessages({
      familyId,
      onInsert: (row) => {
        if (row.sender_caregiver_id !== caregiverId) {
          refreshFromRealtime();
        }
      },
      onStatus: (status) => {
        if (status === "SUBSCRIBED") {
          refreshFromRealtime();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`Family chat Realtime channel status: ${status}`);
        }
      },
    });
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshFromRealtime();
      }
    });

    return () => {
      active = false;
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [session?.caregiver.id, session?.family.id]);

  async function initialize() {
    let initializationVersion = ++hydrationRequestVersion.current;
    setIsBooting(true);
    setError(null);
    setSessionRecoveryRequired(false);

    try {
      await clearLegacyPreferences();
      if (hydrationRequestVersion.current !== initializationVersion) return;

      try {
        const restored = await restoreSession();
        if (hydrationRequestVersion.current !== initializationVersion) return;
        const hydration = hydrate(restored, bootstrap, true);
        initializationVersion = hydrationRequestVersion.current;
        await hydration;
      } catch (sessionError) {
        if (hydrationRequestVersion.current !== initializationVersion) return;
        if (isTerminalSessionError(sessionError)) {
          const clearing = clearLocalSession();
          initializationVersion = hydrationRequestVersion.current;
          await clearing;
        } else {
          setSessionRecoveryRequired(true);
          setError(sessionError instanceof Error ? sessionError.message : "저장된 로그인 정보가 만료되어 다시 로그인해 주세요.");
        }
      }
    } catch (loadError) {
      if (hydrationRequestVersion.current !== initializationVersion) return;
      setError(loadError instanceof Error ? loadError.message : "앱을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      if (hydrationRequestVersion.current === initializationVersion) setIsBooting(false);
    }
  }

  async function hydrate(
    nextSession: SessionResponse,
    preview = bootstrap,
    resumePushRegistration = false,
  ) {
    const hydrationVersion = ++hydrationRequestVersion.current;
    activeSessionScope.current = { caregiverId: nextSession.caregiver.id, familyId: nextSession.family.id };
    if (resumePushRegistration) {
      resumePushRegistrationForAuthenticatedSession();
    }
    timelineTargetRequestVersion.current += 1;
    const currentConsentAccepted = await hasCurrentLegalConsent();
    if (hydrationRequestVersion.current !== hydrationVersion) return;
    setSession(nextSession);
    setLegalConsentRequired(!currentConsentAccepted);

    if (!currentConsentAccepted) {
      setSessionRecoveryRequired(false);
      return;
    }

    try {
      await refreshContentSafetyState();
      if (hydrationRequestVersion.current !== hydrationVersion) return;
      const safetyVersion = safetyRequestVersion.current;
      const timelineRequestVersion = ++timelineTargetRequestVersion.current;
      if (!nextSession.child) {
        familyChatRequestVersion.current += 1;
        const [settingsPayload, previewPayload] = await Promise.all([
          fetchSettings(nextSession.family.id),
          preview ? Promise.resolve(preview) : fetchBootstrap(),
        ]);

        startRefreshTransition(() => {
          if (hydrationRequestVersion.current !== hydrationVersion) return;
          if (safetyRequestVersion.current !== safetyVersion) return;
          setBootstrap(previewPayload);
          setSession({ ...nextSession, settings: settingsPayload.settings });
          setDashboard(null);
          setChat(null);
          setFamilyChat(null);
          setNotebook(null);
          setSettings(settingsPayload);
          setGrowthMeasurements([]);
          setSessionRecoveryRequired(false);
        });
        return;
      }

      const requestVersion = ++familyChatRequestVersion.current;
      const [dashboardPayload, chatPayload, familyChatPayload, notebookPayload, settingsPayload, growthPayload, previewPayload] = await Promise.all([
        fetchDashboard(nextSession.family.id),
        fetchChat(nextSession.family.id, chatQueryForDate(timelineDate)),
        fetchFamilyChat(nextSession.family.id),
        fetchNotebook(nextSession.family.id),
        fetchSettings(nextSession.family.id),
        fetchGrowthMeasurements(nextSession.family.id),
        preview ? Promise.resolve(preview) : fetchBootstrap(),
      ]);

      startRefreshTransition(() => {
        if (hydrationRequestVersion.current !== hydrationVersion) return;
        if (safetyRequestVersion.current !== safetyVersion) return;
        setBootstrap(previewPayload);
        setSession({ ...nextSession, settings: settingsPayload.settings });
        setDashboard(dashboardPayload);
        if (timelineTargetRequestVersion.current === timelineRequestVersion) {
          setChat(chatPayload);
        }
        if (familyChatRequestVersion.current === requestVersion) {
          setFamilyChat(familyChatPayload);
        }
        setNotebook(notebookPayload);
        setSettings(settingsPayload);
        setGrowthMeasurements(growthPayload);
        setSessionRecoveryRequired(false);
      });
      if (hydrationRequestVersion.current !== hydrationVersion) return;
      void registerPushDeviceToken(nextSession).catch(() => {
        console.warn("Failed to register push device token.");
      });
    } catch (hydrateError) {
      if (hydrationRequestVersion.current !== hydrationVersion) return;
      setSessionRecoveryRequired(true);
      throw hydrateError;
    }
  }

  async function refreshDashboard(nextSession = session) {
    if (!nextSession) {
      return;
    }

    const safetyVersion = safetyRequestVersion.current;
    const payload = await fetchDashboard(nextSession.family.id);
    startRefreshTransition(() => {
      if (safetyRequestVersion.current === safetyVersion) setDashboard(payload);
    });
  }

  async function refreshChat(nextSession = session, date = timelineDate) {
    if (!nextSession) {
      return;
    }

    const requestVersion = ++timelineTargetRequestVersion.current;
    const payload = await fetchChat(nextSession.family.id, chatQueryForDate(date));
    if (timelineTargetRequestVersion.current === requestVersion) {
      startRefreshTransition(() => setChat(payload));
    }
  }

  async function refreshFamilyChat(nextSession = session) {
    if (!nextSession) {
      return;
    }

    const requestVersion = ++familyChatRequestVersion.current;
    const payload = await fetchFamilyChat(nextSession.family.id);
    if (familyChatRequestVersion.current !== requestVersion) {
      return;
    }
    startRefreshTransition(() => setFamilyChat(payload));
  }

  function isCurrentSessionScope(expected: { caregiverId: number; familyId: number }) {
    return activeSessionScope.current?.caregiverId === expected.caregiverId
      && activeSessionScope.current?.familyId === expected.familyId;
  }

  function applyFamilyChatMessage(message: FamilyChatMessageCard, expected: { caregiverId: number; familyId: number }) {
    if (!isCurrentSessionScope(expected)) return;
    const family = session?.family ?? bootstrap?.family;
    if (!family || family.id !== expected.familyId) {
      return;
    }

    familyChatRequestVersion.current += 1;
    setFamilyChat((current) => isCurrentSessionScope(expected) ? prependFamilyChatMessage(current, family, message) : current);
  }

  async function changeTimelineDate(nextDate: Date) {
    const requestVersion = ++timelineTargetRequestVersion.current;
    const normalized = normalizeLocalDate(nextDate);
    setTimelineDate(normalized);

    if (!session) {
      return;
    }

    try {
      setBusyAction("timeline-date");
      setError(null);
      const payload = await fetchChat(session.family.id, chatQueryForDate(normalized));
      if (timelineTargetRequestVersion.current === requestVersion) {
        startRefreshTransition(() => setChat(payload));
      }
    } catch (loadError) {
      if (timelineTargetRequestVersion.current === requestVersion) {
        setError(loadError instanceof Error ? loadError.message : "선택한 날짜의 타임라인을 불러오지 못했어요.");
      }
    } finally {
      if (timelineTargetRequestVersion.current === requestVersion) {
        setBusyAction(null);
      }
    }
  }

  async function openTimelineMessage(messageId: number) {
    if (!session) {
      return false;
    }

    const requestVersion = ++timelineTargetRequestVersion.current;

    try {
      setBusyAction("timeline-target");
      setError(null);

      const targetPayload = await fetchChat(session.family.id, { messageId, limit: 1 });
      const targetMessage = targetPayload.messages[0] ?? null;
      if (!targetMessage) {
        throw new Error("해당 메시지를 찾을 수 없어요.");
      }

      const targetDate = new Date(targetMessage.createdAt);
      if (Number.isNaN(targetDate.getTime())) {
        throw new Error("메시지 날짜를 확인할 수 없어요.");
      }

      const normalized = normalizeLocalDate(targetDate);
      const dayPayload = await fetchChat(session.family.id, chatQueryForDate(normalized));
      const messages = dayPayload.messages.some((message) => message.id === targetMessage.id)
        ? dayPayload.messages
        : [...dayPayload.messages, targetMessage].sort(
            (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
          );

      if (timelineTargetRequestVersion.current !== requestVersion) {
        return false;
      }

      startRefreshTransition(() => {
        setTimelineDate(normalized);
        setChat({ ...dayPayload, messages });
      });
      return true;
    } catch (loadError) {
      if (timelineTargetRequestVersion.current === requestVersion) {
        setError(loadError instanceof Error ? loadError.message : "알림 메시지를 불러오지 못했어요.");
      }
      return false;
    } finally {
      if (timelineTargetRequestVersion.current === requestVersion) {
        setBusyAction(null);
      }
    }
  }

  async function refreshNotebook(nextSession = session) {
    if (!nextSession) {
      return;
    }

    const safetyVersion = safetyRequestVersion.current;
    const payload = await fetchNotebook(nextSession.family.id);
    startRefreshTransition(() => {
      if (safetyRequestVersion.current === safetyVersion) setNotebook(payload);
    });
  }

  async function refreshAll() {
    let refreshVersion = hydrationRequestVersion.current;
    try {
      setBusyAction("refresh");
      setError(null);

      const preview = await fetchBootstrap();
      if (hydrationRequestVersion.current !== refreshVersion) return;
      setBootstrap(preview);

      if (!session) {
        return;
      }

      const restored = await restoreSession();
      if (hydrationRequestVersion.current !== refreshVersion) return;
      const hydration = hydrate(restored, preview);
      refreshVersion = hydrationRequestVersion.current;
      await hydration;
    } catch (loadError) {
      if (hydrationRequestVersion.current !== refreshVersion) return;
      if (session && isTerminalSessionError(loadError)) {
        const clearing = clearLocalSession();
        refreshVersion = hydrationRequestVersion.current;
        await clearing;
      }
      if (hydrationRequestVersion.current !== refreshVersion) return;
      setError(loadError instanceof Error ? loadError.message : "최신 내용을 다시 불러오지 못했어요.");
    } finally {
      if (hydrationRequestVersion.current === refreshVersion) setBusyAction(null);
    }
  }

  async function clearLocalSession() {
    hydrationRequestVersion.current += 1;
    const clearingVersion = hydrationRequestVersion.current;
    activeSessionScope.current = null;
    safetyRequestVersion.current += 1;
    invalidateFamilyMediaCache();
    await clearSessionToken();
    if (hydrationRequestVersion.current !== clearingVersion) return;
    familyChatRequestVersion.current += 1;
    timelineTargetRequestVersion.current += 1;
    startRefreshTransition(() => {
      if (hydrationRequestVersion.current !== clearingVersion) return;
      setSession(null);
      setDashboard(null);
      setChat(null);
      setFamilyChat(null);
      setNotebook(null);
      setSettings(null);
      setGrowthMeasurements([]);
      setBusyAction(null);
      setLegalConsentRequired(false);
      setSessionRecoveryRequired(false);
      setActiveTab("dashboard");
      setTimelineDate(normalizeLocalDate(new Date()));
    });
  }

  async function acceptLegalConsent() {
    const consentVersion = hydrationRequestVersion.current;
    await acceptCurrentLegalConsent();
    if (hydrationRequestVersion.current !== consentVersion) return;
    const restored = await restoreSession();
    if (hydrationRequestVersion.current !== consentVersion) return;
    await hydrate(restored);
  }

  function applySettings(nextSettings: SettingsResponse) {
    startRefreshTransition(() => {
      setSettings(nextSettings);
      setSession((current) => (current ? { ...current, settings: nextSettings.settings } : current));
    });
  }

  function applyCaregiverProfile(caregiver: CaregiverSummary) {
    startRefreshTransition(() => {
      setSession((current) => (current ? { ...current, caregiver } : current));
      setSettings((current) =>
        current
          ? {
              ...current,
              caregivers: current.caregivers.map((item) => (item.id === caregiver.id ? caregiver : item)),
            }
          : current,
      );
      setBootstrap((current) =>
        current
          ? {
              ...current,
              caregivers: current.caregivers.map((item) => (item.id === caregiver.id ? caregiver : item)),
            }
          : current,
      );
    });
  }

  function applyTimelineComment(comment: TimelineCommentCard) {
    startRefreshTransition(() => {
      setChat((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          messages: current.messages.map((message) => {
            if (message.id !== comment.messageId) {
              return message;
            }

            if (comment.parentCommentId == null) {
              const exists = message.comments.some((item) => item.id === comment.id);
              return exists ? message : { ...message, comments: [...message.comments, comment] };
            }

            return {
              ...message,
              comments: message.comments.map((item) => {
                if (item.id !== comment.parentCommentId) {
                  return item;
                }

                const exists = item.replies.some((reply) => reply.id === comment.id);
                return exists ? item : { ...item, replies: [...item.replies, comment] };
              }),
            };
          }),
        };
      });
    });
  }

  return {
    bootstrap,
    setBootstrap,
    session,
    setSession,
    dashboard,
    chat,
    familyChat,
    notebook,
    settings,
    growthMeasurements,
    activeTab,
    setActiveTab,
    error,
    setError,
    busyAction,
    setBusyAction,
    timelineDate,
    changeTimelineDate,
    openTimelineMessage,
    isBooting,
    sessionRecoveryRequired,
    legalConsentRequired,
    isRefreshing,
    currentFamily,
    currentChild,
    currentSettings,
    hydrate,
    isCurrentSessionScope,
    retrySessionRestore: initialize,
    refreshDashboard,
    refreshChat,
    refreshFamilyChat,
    applyFamilyChatMessage,
    refreshNotebook,
    refreshAll,
    clearLocalSession,
    acceptLegalConsent,
    applySettings,
    applyCaregiverProfile,
    applyTimelineComment,
  };
}

export type UseBabyBossRuntimeResult = ReturnType<typeof useBabyBossRuntime>;
