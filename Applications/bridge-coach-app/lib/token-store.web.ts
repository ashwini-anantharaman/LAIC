// Web fallback for session storage — localStorage is fine for the dev preview;
// real devices use the SecureStore implementation in token-store.ts.
//
// Same JSON shape and bare-string migration as the native store.

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
    return { access_token: raw };
  }
}

export async function getSession(): Promise<StoredSession | null> {
  return parseSession(localStorage.getItem(TOKEN_KEY));
}

export async function setSession(session: StoredSession): Promise<void> {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
}

export async function getToken(): Promise<string | null> {
  return (await getSession())?.access_token ?? null;
}

export async function setToken(token: string): Promise<void> {
  await setSession({ access_token: token });
}

export async function clearToken(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY);
}
