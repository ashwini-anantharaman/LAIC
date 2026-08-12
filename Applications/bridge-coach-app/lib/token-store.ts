import * as SecureStore from "expo-secure-store";

// Native session storage — Keychain (iOS) / Keystore (Android).
// Web builds resolve token-store.web.ts instead.
//
// The stored value is a JSON session: { access_token, refresh_token?,
// expires_at? }. Older installs stored the bare access token string under the
// same key — a non-JSON read is adopted as { access_token } so nobody is
// signed out by the upgrade.

const TOKEN_KEY = "nexus_access_token";

export type StoredSession = {
  access_token: string;
  /** Rotates on every refresh — always store the newest one. */
  refresh_token?: string;
  /** Unix SECONDS (Supabase's unit), when the access token dies. */
  expires_at?: number;
};

function parseSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    return typeof parsed?.access_token === "string" ? parsed : null;
  } catch {
    // Pre-refresh installs stored the bare token string.
    return { access_token: raw };
  }
}

export async function getSession(): Promise<StoredSession | null> {
  return parseSession(await SecureStore.getItemAsync(TOKEN_KEY));
}

export async function setSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(session));
}

export async function getToken(): Promise<string | null> {
  return (await getSession())?.access_token ?? null;
}

export async function setToken(token: string): Promise<void> {
  await setSession({ access_token: token });
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
