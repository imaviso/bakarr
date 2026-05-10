import { API_BASE } from "~/api/constants";

export interface AuthState {
  readonly username?: string | undefined;
  readonly apiKey?: string | undefined;
  readonly isAuthenticated: boolean;
}

let authState: AuthState = { isAuthenticated: false };
const listeners = new Set<() => void>();

export function getAuthState(): AuthState {
  return authState;
}

export function subscribeAuth(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function loginSuccess(username: string, apiKey?: string) {
  const key = normalizeApiKey(apiKey);
  authState = {
    username,
    apiKey: key,
    isAuthenticated: true,
  };
  emit();
}

export function syncAuthenticatedUser(username: string) {
  authState = { ...authState, isAuthenticated: true, username };
  emit();
}

export function clearAuthState() {
  authState = { isAuthenticated: false };
  emit();
}

function normalizeApiKey(apiKey?: string): string | undefined {
  const value = apiKey?.trim();
  if (!value || /^\*+$/.test(value)) {
    return undefined;
  }
  return value;
}

export async function clearServerSession() {
  await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function logout() {
  try {
    await clearServerSession();
  } catch {
    // Local sign-out should still happen if the server is temporarily unreachable.
  }

  clearAuthState();
  globalThis.location.href = "/login";
}

export function getAuthHeaders(): HeadersInit {
  const key = authState.apiKey;
  return key ? { "X-Api-Key": key } : {};
}
