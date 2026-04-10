import { type Accessor, createContext, createSignal, type JSX, useContext } from "solid-js";

export interface AuthState {
  username?: string | undefined;
  apiKey?: string | undefined;
  isAuthenticated: boolean;
}

const AUTH_STORAGE_KEY = "bakarr_auth";

function normalizeApiKey(apiKey?: string) {
  const value = apiKey?.trim();
  if (!value || /^\*+$/.test(value)) {
    return undefined;
  }
  return value;
}

function getStoredAuth(): AuthState {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const apiKey = normalizeApiKey(
        typeof parsed === "object" && parsed && "apiKey" in parsed
          ? String(parsed.apiKey ?? "")
          : undefined,
      );
      return {
        username: parsed.username,
        ...(apiKey === undefined ? {} : { apiKey }),
        isAuthenticated: Boolean(parsed.isAuthenticated),
      };
    }
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  return { isAuthenticated: false };
}

// Global Auth State
const [auth, setAuth] = createSignal<AuthState>(getStoredAuth());

function saveAuth(state: AuthState) {
  if (state.isAuthenticated) {
    const apiKey = normalizeApiKey(state.apiKey);
    const toStore = {
      username: state.username,
      ...(apiKey === undefined ? {} : { apiKey }),
      isAuthenticated: state.isAuthenticated,
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(toStore));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  setAuth(state);
}

export const loginSuccess = (username: string, apiKey?: string) => {
  saveAuth({
    username,
    apiKey: normalizeApiKey(apiKey),
    isAuthenticated: true,
  });
};

export const loginApiKey = (apiKey: string) => {
  saveAuth({
    apiKey: normalizeApiKey(apiKey),
    isAuthenticated: true,
  });
};

export const logout = async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  saveAuth({ isAuthenticated: false });
  globalThis.location.href = "/login";
};

export const getAuthHeaders = (): HeadersInit => {
  const state = auth();
  if (state.apiKey) {
    return { "X-Api-Key": state.apiKey };
  }
  return {};
};

// Create the auth context
interface AuthContextValue {
  auth: Accessor<AuthState>;
  loginSuccess: (username: string, apiKey?: string) => void;
  loginApiKey: (apiKey: string) => void;
  logout: () => Promise<void>;
  getAuthHeaders: () => HeadersInit;
}

const AuthContext = createContext<AuthContextValue>();

const authContextValue: AuthContextValue = {
  auth,
  loginSuccess,
  loginApiKey,
  logout,
  getAuthHeaders,
};

export function AuthProvider(props: { children: JSX.Element }) {
  return <AuthContext.Provider value={authContextValue}>{props.children}</AuthContext.Provider>;
}

// Hook to use auth context in components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Getter function that works outside of Solid components (e.g., in router loaders)
export { auth as getAuthState };
