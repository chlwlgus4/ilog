import { useEffect, useRef, useState, type ReactNode } from "react";
import { Stack, usePathname, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import * as NativeSplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { RequiredChildProfileView } from "../src/features/auth/RequiredChildProfileView";
import { useAppAlert } from "../src/features/shared/appAlerts";
import { BabyBossAppProvider, useBabyBossAppContext } from "../src/hooks/BabyBossAppContext";
import { resolveNotificationRoute, type NotificationRoute } from "../src/notifications/notificationNavigation";
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
  const isRoot = pathname === "/" || pathname === "";
  const isAuth = isAuthPath(pathname);
  const isProtected = isProtectedPath(pathname);
  const hasSession = Boolean(app.session);
  const hasChild = Boolean(app.session?.child);
  const isRedirecting =
    (!hasSession && (isRoot || isProtected)) ||
    (hasSession && hasChild && (isRoot || isAuth));

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
  const [pendingNotificationRoute, setPendingNotificationRoute] = useState<NotificationRoute | null>(null);
  const isRoot = pathname === "/" || pathname === "";
  const isAuth = isAuthPath(pathname);
  const isProtected = isProtectedPath(pathname);
  const hasSession = Boolean(app.session);
  const hasChild = Boolean(app.session?.child);
  const shouldRedirectToLogin = isProtected && !app.isBooting && !hasSession;
  const shouldRedirectRootToLogin = isRoot && !app.isBooting && !hasSession;
  const shouldRequireChildProfile = !app.isBooting && hasSession && !hasChild;
  const shouldRedirectSessionToHome = !app.isBooting && hasSession && hasChild && (isRoot || isAuth);
  const shouldOpenNotificationRoute = !app.isBooting && hasSession && hasChild && pendingNotificationRoute !== null;
  const lastRedirectKeyRef = useRef<string | null>(null);

  useNotificationRouteObserver(setPendingNotificationRoute);

  useEffect(() => {
    const target = shouldRedirectToLogin || shouldRedirectRootToLogin ? "/login" : shouldOpenNotificationRoute ? pendingNotificationRoute : shouldRedirectSessionToHome ? "/home" : null;

    if (!target) {
      lastRedirectKeyRef.current = null;
      return;
    }

    const redirectKey = `${pathname}->${target}`;
    if (lastRedirectKeyRef.current === redirectKey) {
      return;
    }

    lastRedirectKeyRef.current = redirectKey;

    if (shouldRedirectToLogin || shouldRedirectRootToLogin) {
      router.replace("/login");
      return;
    }

    if (shouldOpenNotificationRoute && pendingNotificationRoute) {
      setPendingNotificationRoute(null);
      if (pendingNotificationRoute === "/family-chat") {
        void app.refreshFamilyChat().catch((error) => {
          console.warn("Failed to refresh family chat after opening a notification.", error);
        });
      }
      router.replace(pendingNotificationRoute);
      return;
    }

    if (shouldRedirectSessionToHome) {
      router.replace("/home");
    }
  }, [pathname, pendingNotificationRoute, router, shouldOpenNotificationRoute, shouldRedirectRootToLogin, shouldRedirectSessionToHome, shouldRedirectToLogin]);

  if (isProtected && (app.isBooting || !app.session)) {
    return null;
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

function useNotificationRouteObserver(onRoute: (route: NotificationRoute) => void) {
  const handledRequestIds = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    let active = true;
    let subscription: { remove: () => void } | undefined;

    function handleNotification(notification: { request: { identifier: string; content: { data?: unknown } } }) {
      if (handledRequestIds.current.has(notification.request.identifier)) {
        return;
      }

      handledRequestIds.current.add(notification.request.identifier);
      onRoute(resolveNotificationRoute(notification.request.content.data));
    }

    void import("expo-notifications")
      .then((Notifications) => {
        if (!active) {
          return;
        }

        const lastResponse = Notifications.getLastNotificationResponse();
        if (lastResponse?.notification) {
          handleNotification(lastResponse.notification);
        }

        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          handleNotification(response.notification);
        });
      })
      .catch((error) => {
        console.warn("Failed to initialize notification navigation.", error);
      });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [onRoute]);
}

function isProtectedPath(pathname: string) {
  return !["/", "/login", "/signup", "/family", "/invite", "/auth/callback", "/app-info", "/terms", "/privacy-policy", "/open-source-licenses"].includes(pathname);
}

function isAuthPath(pathname: string) {
  return ["/login", "/signup", "/family", "/auth/callback"].includes(pathname);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
