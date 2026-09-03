import { useEffect, useRef, useState, type ReactNode } from "react";
import { Stack, usePathname, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import * as NativeSplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { RequiredChildProfileView } from "../src/features/auth/RequiredChildProfileView";
import { RequiredLegalConsentView } from "../src/features/auth/RequiredLegalConsentView";
import { useAppAlert } from "../src/features/shared/appAlerts";
import { BabyBossAppProvider, useBabyBossAppContext } from "../src/hooks/BabyBossAppContext";
import {
  resolveNotificationDestination,
  type NotificationDestination,
} from "../src/notifications/notificationNavigation";
import {
  isProtectedPath,
  isRootPath,
  isSessionEntryPath,
  resolveSessionRecoveryPolicy,
} from "../src/navigation/sessionRoutePolicy";
import { configureTypographyDefaults, pretendardFontMap } from "../src/typography";

configureTypographyDefaults();

const nativeSplashMinimumDurationMs = 1600;
const shouldHoldNativeSplash = Platform.OS !== "web";

if (shouldHoldNativeSplash) {
  void NativeSplashScreen.preventAutoHideAsync().catch(() => undefined);
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(pretendardFontMap);

  useEffect(() => {
    configureTypographyDefaults();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <SafeAreaView style={styles.safeArea} edges={["top", "right", "bottom", "left"]}>
          <BabyBossAppProvider>
            <AppErrorAlert />
            <NativeSplashController />
            <StatusBar style="dark" />
            <SessionRouteGate>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFFFF" } }} />
            </SessionRouteGate>
          </BabyBossAppProvider>
        </SafeAreaView>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

function AppErrorAlert() {
  const app = useBabyBossAppContext();

  useAppAlert(app.error);

  return null;
}

function NativeSplashController() {
  const pathname = usePathname();
  const app = useBabyBossAppContext();
  const [minimumDurationDone, setMinimumDurationDone] = useState(!shouldHoldNativeSplash);
  const hiddenRef = useRef(false);
  const isRoot = isRootPath(pathname);
  const isProtected = isProtectedPath(pathname);
  const hasSession = Boolean(app.session);
  const hasChild = Boolean(app.session?.child);
  const { showRecovery, allowSessionRedirects } = resolveSessionRecoveryPolicy({
    pathname,
    isBooting: app.isBooting,
    sessionRecoveryRequired: app.sessionRecoveryRequired,
  });
  const isRedirecting = allowSessionRedirects && !showRecovery && (
    (!hasSession && (isRoot || isProtected))
    || (hasSession && hasChild && (isRoot || isSessionEntryPath(pathname)))
  );

  useEffect(() => {
    if (!shouldHoldNativeSplash) {
      return;
    }

    const timer = setTimeout(() => setMinimumDurationDone(true), nativeSplashMinimumDurationMs);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!shouldHoldNativeSplash || hiddenRef.current || !minimumDurationDone || app.isBooting || isRedirecting) {
      return;
    }

    hiddenRef.current = true;
    void NativeSplashScreen.hideAsync().catch(() => undefined);
  }, [app.isBooting, isRedirecting, minimumDurationDone]);

  return null;
}

function SessionRouteGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const app = useBabyBossAppContext();
  const [pendingNotificationDestination, setPendingNotificationDestination] = useState<NotificationDestination | null>(null);
  const isRoot = isRootPath(pathname);
  const isProtected = isProtectedPath(pathname);
  const hasSession = Boolean(app.session);
  const hasChild = Boolean(app.session?.child);
  const isLegalDocumentPath = pathname === "/terms" || pathname === "/privacy-policy";
  const isAccountDeletionPath = pathname === "/account-deletion";
  const { showRecovery: shouldRecoverSession, allowSessionRedirects } = resolveSessionRecoveryPolicy({
    pathname,
    isBooting: app.isBooting,
    sessionRecoveryRequired: app.sessionRecoveryRequired,
  });
  const shouldRedirectToLogin = allowSessionRedirects && isProtected && !hasSession;
  const shouldRedirectRootToLogin = allowSessionRedirects && isRoot && !hasSession;
  const shouldRequireChildProfile = !app.isBooting && !app.sessionRecoveryRequired && hasSession && !hasChild && !isAccountDeletionPath;
  const shouldRequireLegalConsent = !app.isBooting && !app.sessionRecoveryRequired && hasSession && app.legalConsentRequired && !isLegalDocumentPath && !isAccountDeletionPath;
  const shouldRedirectSessionToHome = allowSessionRedirects && hasSession && hasChild && (isRoot || isSessionEntryPath(pathname));
  const shouldOpenNotificationDestination = allowSessionRedirects && hasSession && hasChild && pendingNotificationDestination !== null;
  const lastRedirectKeyRef = useRef<string | null>(null);

  useNotificationDestinationObserver(setPendingNotificationDestination);

  useEffect(() => {
    const target = shouldRedirectToLogin || shouldRedirectRootToLogin
      ? { pathname: "/login" as const, params: undefined }
      : shouldOpenNotificationDestination
        ? pendingNotificationDestination
        : shouldRedirectSessionToHome
          ? { pathname: "/home" as const, params: undefined }
          : null;

    if (!target) {
      lastRedirectKeyRef.current = null;
      return;
    }

    const redirectKey = `${pathname}->${target.pathname}?${JSON.stringify(target.params ?? {})}`;
    if (lastRedirectKeyRef.current === redirectKey) {
      return;
    }

    lastRedirectKeyRef.current = redirectKey;

    if (shouldRedirectToLogin || shouldRedirectRootToLogin) {
      router.replace("/login");
      return;
    }

    if (shouldOpenNotificationDestination && pendingNotificationDestination) {
      setPendingNotificationDestination(null);
      router.replace(pendingNotificationDestination);
      return;
    }

    if (shouldRedirectSessionToHome) {
      router.replace("/home");
    }
  }, [pathname, pendingNotificationDestination, router, shouldOpenNotificationDestination, shouldRedirectRootToLogin, shouldRedirectSessionToHome, shouldRedirectToLogin]);

  if (shouldRecoverSession) {
    return <SessionRecoveryView onRetry={() => void app.retrySessionRestore()} />;
  }

  if (isProtected && (app.isBooting || !app.session)) {
    return null;
  }

  if (shouldRequireLegalConsent) {
    return <RequiredLegalConsentView busy={app.busyAction === "legal-consent"} onSubmit={() => app.handleLegalConsent()} />;
  }

  if (shouldRequireChildProfile) {
    return (
      <RequiredChildProfileView
        busy={app.busyAction === "child-profile"}
        onSubmit={(payload) => app.handleCreateChildProfile(payload)}
      />
    );
  }

  return children;
}

function SessionRecoveryView({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.sessionRecovery} testID="session-recovery">
      <Text style={styles.sessionRecoveryTitle}>로그인 상태를 확인하지 못했어요</Text>
      <Text style={styles.sessionRecoveryBody}>인터넷 연결을 확인한 뒤 다시 시도해 주세요. 저장된 로그인 정보는 그대로 유지됩니다.</Text>
      <Pressable
        style={styles.sessionRecoveryButton}
        onPress={onRetry}
        accessibilityRole="button"
        testID="session-recovery-retry"
      >
        <Text style={styles.sessionRecoveryButtonText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

function useNotificationDestinationObserver(onDestination: (destination: NotificationDestination) => void) {
  const tapSequence = useRef(0);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    let active = true;
    let subscription: { remove: () => void } | undefined;

    function handleNotification(notification: { request: { identifier: string; content: { data?: unknown } } }) {
      const destination = resolveNotificationDestination(notification.request.content.data);
      tapSequence.current += 1;
      onDestination({
        ...destination,
        params: {
          ...destination.params,
          notificationTap: `${notification.request.identifier}-${tapSequence.current}`,
        },
      });
    }

    void import("expo-notifications")
      .then((Notifications) => {
        if (!active) {
          return;
        }

        const lastResponse = Notifications.getLastNotificationResponse();
        if (lastResponse?.notification) {
          handleNotification(lastResponse.notification);
          try {
            Notifications.clearLastNotificationResponse();
          } catch {
            console.warn("Failed to clear the handled notification response.");
          }
        }

        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          handleNotification(response.notification);
          try {
            Notifications.clearLastNotificationResponse();
          } catch {
            console.warn("Failed to clear the handled notification response.");
          }
        });
      })
      .catch(() => {
        console.warn("Failed to initialize notification navigation.");
      });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [onDestination]);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  sessionRecovery: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
    backgroundColor: "#FFFFFF",
  },
  sessionRecoveryTitle: {
    color: "#26364D",
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  sessionRecoveryBody: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  sessionRecoveryButton: {
    minHeight: 46,
    minWidth: 132,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#4DB6AC",
    paddingHorizontal: 20,
  },
  sessionRecoveryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
});
