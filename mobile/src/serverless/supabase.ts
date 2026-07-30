import "react-native-url-polyfill/auto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform, type NativeEventSubscription } from "react-native";

import { authStorage } from "./authStorage";
import { getSupabaseConfig } from "./config";

let cachedClient: SupabaseClient | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

function configureNativeAutoRefresh(client: SupabaseClient) {
  if (Platform.OS === "web" || appStateSubscription) {
    return;
  }

  if (AppState.currentState === "active") {
    client.auth.startAutoRefresh();
  } else {
    client.auth.stopAutoRefresh();
  }

  appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      client.auth.startAutoRefresh();
    } else {
      client.auth.stopAutoRefresh();
    }
  });
}

export function getBabyBossSupabaseClient() {
  const config = getSupabaseConfig();

  if (!config.isConfigured) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
    configureNativeAutoRefresh(cachedClient);
  }

  return cachedClient;
}
