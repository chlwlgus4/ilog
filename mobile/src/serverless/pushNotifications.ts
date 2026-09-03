import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";

import type { LogType, SessionResponse } from "../api";
import { retryLogoutNotificationCleanup } from "../features/auth/logoutPrivacyPolicy";
import { authStorage } from "./authStorage";
import { getBabyBossSupabaseClient } from "./supabase";
import { stablePushDeviceId } from "./pushDeviceIdentity";
import { PushRegistrationLifecycle } from "./pushRegistrationLifecycle";
import {
  createRecordAlarmNotificationContent,
  recordAlarmChannelId,
  secondsUntilRecordAlarm,
} from "./recordAlarmNotification";

let notificationHandlerConfigured = false;
const registeredExpoPushTokenStorageKey = "ilog.push.registered-expo-token";
const pushRegistrationLifecycle = new PushRegistrationLifecycle();
let latestExpoPushToken: string | null = null;

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

async function performPushDeviceRegistration(
  session: SessionResponse,
  registrationGeneration: number,
): Promise<PushPermissionStatus> {
  const permissionStatus = await requestPushNotificationPermission();
  if (permissionStatus !== "granted") {
    return permissionStatus;
  }
  if (!pushRegistrationLifecycle.isRegistrationCurrent(registrationGeneration)) {
    return "unconfigured";
  }

  const supabase = getBabyBossSupabaseClient();
  if (!supabase) {
    return "unconfigured";
  }

  const Notifications = await loadNotificationsModule();
  if (!pushRegistrationLifecycle.isRegistrationCurrent(registrationGeneration)) {
    return "unconfigured";
  }
  const projectId = expoProjectId();
  const tokenPayload = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  latestExpoPushToken = tokenPayload.data;
  if (!pushRegistrationLifecycle.isRegistrationCurrent(registrationGeneration)) {
    return "unconfigured";
  }
  let deviceId: string | null = null;
  try {
    deviceId = await stablePushDeviceId({
      platform: Platform.OS,
      iosId: Platform.OS === "ios" ? await Application.getIosIdForVendorAsync() : null,
      androidId: Platform.OS === "android" ? Application.getAndroidId() : null,
    });
  } catch {
    // The Expo token remains installation-specific when a native identifier
    // is temporarily unavailable.
  }

  if (!pushRegistrationLifecycle.isRegistrationCurrent(registrationGeneration)) {
    return "unconfigured";
  }

  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (
    authError ||
    !authData.session ||
    !pushRegistrationLifecycle.isRegistrationCurrent(registrationGeneration)
  ) {
    return "unconfigured";
  }

  const { error: registrationError } = await supabase.rpc("upsert_push_device_token_checked", {
    p_family_id: session.family.id,
    p_expo_push_token: tokenPayload.data,
    p_platform: Platform.OS,
    p_device_id: deviceId,
    p_app_version: Constants.expoConfig?.version ?? null,
  });
  if (registrationError) {
    throw new Error("푸시 알림 기기를 등록하지 못했어요.");
  }

  try {
    await authStorage.setItem(registeredExpoPushTokenStorageKey, tokenPayload.data);
  } catch {
    // Registration still succeeded; native device ID remains the fallback for
    // exact server cleanup and native unregister remains available at logout.
  }

  return "granted";
}

export function resumePushRegistrationForAuthenticatedSession() {
  return pushRegistrationLifecycle.resumeForAuthenticatedSession();
}

export function completePushRegistrationLogout() {
  pushRegistrationLifecycle.finishLogout();
}

export async function registerPushDeviceToken(session: SessionResponse): Promise<PushPermissionStatus> {
  const registrationGeneration = pushRegistrationLifecycle.beginRegistration();
  if (registrationGeneration == null) {
    return "unconfigured";
  }

  return pushRegistrationLifecycle.track(
    performPushDeviceRegistration(session, registrationGeneration),
  );
}

export async function removePushRegistrationForLogout() {
  await pushRegistrationLifecycle.blockForLogoutAndWait();

  if (Platform.OS === "web") {
    return;
  }

  let deviceId: string | null = null;
  try {
    deviceId = await stablePushDeviceId({
      platform: Platform.OS,
      iosId: Platform.OS === "ios" ? await Application.getIosIdForVendorAsync() : null,
      androidId: Platform.OS === "android" ? Application.getAndroidId() : null,
    });
  } catch {
    // Continue with the installation-specific Expo token and native cleanup.
  }

  let registeredExpoPushToken: string | null = null;
  try {
    registeredExpoPushToken = await authStorage.getItem(registeredExpoPushTokenStorageKey);
  } catch {
    // Secure storage availability must not prevent local notification cleanup.
  }
  registeredExpoPushToken ??= latestExpoPushToken;

  const supabase = getBabyBossSupabaseClient();
  let serverCleanupSucceeded = false;

  if (supabase && (deviceId || registeredExpoPushToken)) {
    try {
      const { error } = await supabase.rpc("remove_current_push_device_token_checked", {
        p_platform: Platform.OS,
        p_device_id: deviceId,
        p_expo_push_token: registeredExpoPushToken,
      });
      serverCleanupSucceeded = !error;
    } catch {
      serverCleanupSucceeded = false;
    }
  }

  let localCleanupSucceeded = false;
  let nativeUnregistrationSucceeded = false;

  try {
    const Notifications = await import("expo-notifications");
    localCleanupSucceeded = await retryLogoutNotificationCleanup({
      cleanupSteps: [
        () => Notifications.cancelAllScheduledNotificationsAsync(),
        () => Notifications.dismissAllNotificationsAsync(),
        () => Notifications.clearLastNotificationResponseAsync(),
      ],
    });
    try {
      await Notifications.unregisterForNotificationsAsync();
      nativeUnregistrationSucceeded = true;
    } catch {
      nativeUnregistrationSucceeded = false;
    }
  } catch {
    nativeUnregistrationSucceeded = false;
  }

  if (serverCleanupSucceeded) {
    latestExpoPushToken = null;
    try {
      await authStorage.removeItem(registeredExpoPushTokenStorageKey);
    } catch {
      // The server row is already deleted; a stale local key can be safely
      // overwritten by the next successful registration.
    }
  }

  if (
    !localCleanupSucceeded ||
    (!serverCleanupSucceeded && !nativeUnregistrationSucceeded)
  ) {
    throw new Error("로그아웃 알림 정보를 정리하지 못했어요.");
  }
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

  return Notifications.scheduleNotificationAsync({
    content: createRecordAlarmNotificationContent({ logType, recordValue }),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: recordAlarmChannelId,
    },
  });
}
