// Web fallback for token storage — localStorage is fine for the dev preview;
// real devices use the SecureStore implementation in token-store.ts.

const TOKEN_KEY = "nexus_access_token";

export async function getToken(): Promise<string | null> {
  return localStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  localStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY);
}
