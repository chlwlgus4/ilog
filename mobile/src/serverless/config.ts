import Constants from "expo-constants";

interface ServerlessExtra {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  hcaptchaSiteKey?: string;
}

function readExtra() {
  return (Constants.expoConfig?.extra ?? {}) as ServerlessExtra;
}

function readPublicEnv(name: string) {
  return typeof process !== "undefined" ? process.env?.[name]?.trim() ?? "" : "";
}

export function getSupabaseConfig() {
  const extra = readExtra();
  const supabaseUrl = extra.supabaseUrl?.trim() || readPublicEnv("EXPO_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = extra.supabaseAnonKey?.trim() || readPublicEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");

  return {
    supabaseUrl,
    supabaseAnonKey,
    isConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  };
}

export function getAuthCaptchaConfig() {
  const extra = readExtra();
  const siteKey = extra.hcaptchaSiteKey?.trim() || readPublicEnv("EXPO_PUBLIC_HCAPTCHA_SITE_KEY");

  return {
    siteKey,
    isConfigured: Boolean(siteKey),
  };
}
