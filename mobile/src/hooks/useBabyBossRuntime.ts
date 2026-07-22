import { useEffect, useRef, useState, useTransition } from "react";
import { AppState } from "react-native";

import {
  fetchBootstrap,
  fetchChat,
  fetchDashboard,
  fetchFamilyChat,
  fetchGrowthMeasurements,
  fetchNotebook,
  fetchSettings,
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
import { registerPushDeviceToken } from "../serverless/pushNotifications";
import { clearLegacyPreferences, clearSessionToken } from "../storage";
import type { TabKey } from "./babyBossAppTypes";

function isMissingSupabaseSession(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("저장된 로그인 세션이 없어요") || message.includes("현재 보호자 정보를 찾지 못했어요");
}

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
  const [timelineDate, setTimelineDate] = useState(() => normalizeLocalDate(new Date()));
  const [isRefreshing, startRefreshTransition] = useTransition();
  const familyChatRequestVersion = useRef(0);
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
        .catch((refreshError) => {
          console.warn("Failed to refresh family chat from Realtime.", refreshError);
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
    setIsBooting(true);
    setError(null);

    try {
      await clearLegacyPreferences();

      try {
        const restored = await restoreSession();
        await hydrate(restored);
      } catch (sessionError) {
        await clearLocalSession();

        if (!isMissingSupabaseSession(sessionError)) {
          setError(sessionError instanceof Error ? sessionError.message : "저장된 로그인 정보가 만료되어 다시 로그인해 주세요.");
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "앱을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsBooting(false);
    }
  }

  async function hydrate(nextSession: SessionResponse, preview = bootstrap) {
    setSession(nextSession);

    if (!nextSession.child) {
      familyChatRequestVersion.current += 1;
      const [settingsPayload, previewPayload] = await Promise.all([
        fetchSettings(nextSession.family.id),
        preview ? Promise.resolve(preview) : fetchBootstrap(),
      ]);

      startRefreshTransition(() => {
        setBootstrap(previewPayload);
        setSession({ ...nextSession, settings: settingsPayload.settings });
        setDashboard(null);
        setChat(null);
        setFamilyChat(null);
        setNotebook(null);
        setSettings(settingsPayload);
        setGrowthMeasurements([]);
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
      setBootstrap(previewPayload);
      setSession({ ...nextSession, settings: settingsPayload.settings });
      setDashboard(dashboardPayload);
      setChat(chatPayload);
      if (familyChatRequestVersion.current === requestVersion) {
        setFamilyChat(familyChatPayload);
      }
      setNotebook(notebookPayload);
      setSettings(settingsPayload);
      setGrowthMeasurements(growthPayload);
    });
    void registerPushDeviceToken(nextSession).catch((error) => {
      console.warn("Failed to register push device token.", error);
    });
  }

  async function refreshDashboard(nextSession = session) {
    if (!nextSession) {
      return;
    }

    const payload = await fetchDashboard(nextSession.family.id);
    startRefreshTransition(() => setDashboard(payload));
  }

  async function refreshChat(nextSession = session, date = timelineDate) {
    if (!nextSession) {
      return;
    }

    const payload = await fetchChat(nextSession.family.id, chatQueryForDate(date));
    startRefreshTransition(() => setChat(payload));
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

  function applyFamilyChatMessage(message: FamilyChatMessageCard) {
    const family = session?.family ?? bootstrap?.family;
    if (!family) {
      return;
    }

    familyChatRequestVersion.current += 1;
    setFamilyChat((current) => prependFamilyChatMessage(current, family, message));
  }

  async function changeTimelineDate(nextDate: Date) {
    const normalized = normalizeLocalDate(nextDate);
    setTimelineDate(normalized);

    if (!session) {
      return;
    }

    try {
      setBusyAction("timeline-date");
      setError(null);
      const payload = await fetchChat(session.family.id, chatQueryForDate(normalized));
      startRefreshTransition(() => setChat(payload));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "선택한 날짜의 타임라인을 불러오지 못했어요.");
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshNotebook(nextSession = session) {
    if (!nextSession) {
      return;
    }

    const payload = await fetchNotebook(nextSession.family.id);
    startRefreshTransition(() => setNotebook(payload));
  }

  async function refreshAll() {
    try {
      setBusyAction("refresh");
      setError(null);

      const preview = await fetchBootstrap();
      setBootstrap(preview);

      if (!session) {
        return;
      }

      const restored = await restoreSession();
      await hydrate(restored, preview);
    } catch (loadError) {
      if (session) {
        await clearLocalSession();
      }
      setError(loadError instanceof Error ? loadError.message : "최신 내용을 다시 불러오지 못했어요.");
    } finally {
      setBusyAction(null);
    }
  }

  async function clearLocalSession() {
    await clearSessionToken();
    familyChatRequestVersion.current += 1;
    startRefreshTransition(() => {
      setSession(null);
      setDashboard(null);
      setChat(null);
      setFamilyChat(null);
      setNotebook(null);
      setSettings(null);
      setGrowthMeasurements([]);
      setActiveTab("dashboard");
      setTimelineDate(normalizeLocalDate(new Date()));
    });
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
    isBooting,
    isRefreshing,
    currentFamily,
    currentChild,
    currentSettings,
    hydrate,
    refreshDashboard,
    refreshChat,
    refreshFamilyChat,
    applyFamilyChatMessage,
    refreshNotebook,
    refreshAll,
    clearLocalSession,
    applySettings,
    applyCaregiverProfile,
    applyTimelineComment,
  };
}

export type UseBabyBossRuntimeResult = ReturnType<typeof useBabyBossRuntime>;
