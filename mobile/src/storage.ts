import AsyncStorage from "@react-native-async-storage/async-storage";

const LEGACY_API_BASE_URL_KEY = "babyboss.apiBaseUrl";
const SESSION_TOKEN_KEY = "babyboss.sessionToken";

export async function clearLegacyPreferences() {
  await Promise.all([
    AsyncStorage.removeItem(LEGACY_API_BASE_URL_KEY),
    AsyncStorage.removeItem(SESSION_TOKEN_KEY),
  ]);
}

export async function clearSessionToken() {
  await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
}
