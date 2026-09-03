import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { getContentSafetySnapshot, refreshContentSafetyState, subscribeContentSafetyState } from "../../serverless/safetyApi";

let monitoringUsers = 0;
let stopMonitoring: (() => void) | null = null;
function startMonitoring() {
  monitoringUsers += 1;
  if (!stopMonitoring) {
    const refresh = () => { if (AppState.currentState === "active" || AppState.currentState == null) void refreshContentSafetyState().catch(() => undefined); };
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    const interval = setInterval(refresh, 30_000);
    stopMonitoring = () => { subscription.remove(); clearInterval(interval); };
  }
  return () => {
    monitoringUsers -= 1;
    if (monitoringUsers === 0) { stopMonitoring?.(); stopMonitoring = null; }
  };
}

export function useContentSafetyState() {
  const state = useSyncExternalStore(subscribeContentSafetyState, getContentSafetySnapshot, getContentSafetySnapshot);
  useEffect(startMonitoring, []);
  useFocusEffect(useCallback(() => { void refreshContentSafetyState().catch(() => undefined); }, []));
  useEffect(() => {
    if (state.status === "idle") void refreshContentSafetyState().catch(() => undefined);
  }, [state.status]);
  return state;
}
