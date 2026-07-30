import * as SecureStore from "expo-secure-store";

// Native token storage — Keychain (iOS) / Keystore (Android).
// Web builds resolve token-store.web.ts instead.

const TOKEN_KEY = "nexus_access_token";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
