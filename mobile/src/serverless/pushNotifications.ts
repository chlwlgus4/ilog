import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";

import type { LogType, SessionResponse } from "../api";
import { recordAlarmRoute } from "../notifications/notificationNavigation";
import { getBabyBossSupabaseClient } from "./supabase";
import { stablePushDeviceId } from "./pushDeviceIdentity";

const recordAlarmChannelId = "record-reminders";
let notificationHandlerConfigured = false;

export type PushPermissionStatus = "granted" | "denied" | "unsupported" | "simulator" | "unconfigured";

async function loadNotificationsModule() {
  const Notifications = await import("expo-notifications");

  if (!notificationHandlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    notificationHandlerConfigured = true;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(recordAlarmChannelId, {
      name: "기록 알림",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
  }

  return Notifications;
}

async function ensureNotificationPermission(Notifications: typeof import("expo-notifications")) {
  const currentPermission = await Notifications.getPermissionsAsync();
  const finalPermission =
    currentPermission.status === "granted" ? currentPermission : await Notifications.requestPermissionsAsync();

  return finalPermission.status === "granted";
}

function expoProjectId() {
  const extra = (Constants.expoConfig?.extra ?? {}) as { easProjectId?: string };
  return extra.easProjectId ?? Constants.easConfig?.projectId ?? undefined;
}

export async function requestPushNotificationPermission(): Promise<PushPermissionStatus> {
  if (Platform.OS === "web") {
    return "unsupported";
  }

  const Device = await import("expo-device");

  if (!Device.isDevice) {
    return "simulator";
  }

  const Notifications = await loadNotificationsModule();
  return (await ensureNotificationPermission(Notifications)) ? "granted" : "denied";
}

export async function registerPushDeviceToken(session: SessionResponse): Promise<PushPermissionStatus> {
  const permissionStatus = await requestPushNotificationPermission();
  if (permissionStatus !== "granted") {
    return permissionStatus;
  }

  const supabase = getBabyBossSupabaseClient();
  if (!supabase) {
    return "unconfigured";
  }

  const Notifications = await loadNotificationsModule();
  const projectId = expoProjectId();
  const tokenPayload = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const deviceId = await stablePushDeviceId({
    platform: Platform.OS,
    iosId: Platform.OS === "ios" ? await Application.getIosIdForVendorAsync() : null,
    androidId: Platform.OS === "android" ? Application.getAndroidId() : null,
  });

  await supabase.rpc("upsert_push_device_token_checked", {
    p_family_id: session.family.id,
    p_expo_push_token: tokenPayload.data,
    p_platform: Platform.OS,
    p_device_id: deviceId,
    p_app_version: Constants.expoConfig?.version ?? null,
  });

  return "granted";
}

export async function scheduleLocalRecordAlarmNotification({
  logType,
  intervalMinutes,
  recordedAt,
  recordValue,
}: {
  logType: LogType;
  intervalMinutes: number;
  recordedAt: string;
  recordValue?: string | null;
}) {
  if (Platform.OS === "web" || !Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    return null;
  }

  const Notifications = await loadNotificationsModule();

  if (!(await ensureNotificationPermission(Notifications))) {
    return null;
  }

  const seconds = secondsUntilRecordAlarm(recordedAt, intervalMinutes);
  const label = recordAlarmLabel(logType);
  const trimmedValue = recordValue?.trim();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `${label} 기록 알림`,
      body: trimmedValue ? `${label} 기록할 시간이에요. (${trimmedValue})` : `${label} 기록할 시간이에요.`,
      data: { kind: "record-alarm", logType, route: recordAlarmRoute(logType) },
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: recordAlarmChannelId,
    },
  });
}

function secondsUntilRecordAlarm(recordedAt: string, intervalMinutes: number) {
  const recordedAtTime = Date.parse(recordedAt);
  const baseTime = Number.isNaN(recordedAtTime) ? Date.now() : recordedAtTime;
  const scheduledAt = baseTime + intervalMinutes * 60_000;
  return Math.max(Math.round((scheduledAt - Date.now()) / 1000), 60);
}

function recordAlarmLabel(logType: LogType) {
  switch (logType) {
    case "FEEDING":
      return "맘마";
    case "SLEEP":
      return "잠";
    case "DIAPER":
      return "기저귀";
    case "TEMPERATURE":
      return "체온";
    case "MEDICINE":
      return "약/영양제";
    case "PUMPING":
      return "유축";
    case "MEMO":
      return "메모";
    case "GROWTH":
      return "성장";
    case "MOMENT":
      return "순간";
    case "CHECKLIST":
      return "할 일";
  }
}
