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

export function logoutAndRedirect() {
  clearAuthState();
  globalThis.location.href = "/login";
}

export const logout = logoutAndRedirect;

export function getAuthHeaders(): HeadersInit {
  const key = authState.apiKey;
  return key ? { "X-Api-Key": key } : {};
}
