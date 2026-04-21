import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";

export interface AuthState {
  username?: string | undefined;
  apiKey?: string | undefined;
  isAuthenticated: boolean;
}

function normalizeApiKey(apiKey?: string) {
  const value = apiKey?.trim();
  if (!value || /^\*+$/.test(value)) {
    return undefined;
  }
  return value;
}

// Global Auth State
let authState: AuthState = { isAuthenticated: false };
let reactSetAuth: React.Dispatch<React.SetStateAction<AuthState>> | null = null;

function saveAuth(state: AuthState) {
  authState = state;
  reactSetAuth?.(state);
}

export const loginSuccess = (username: string, apiKey?: string) => {
  saveAuth({
    username,
    apiKey: normalizeApiKey(apiKey),
    isAuthenticated: true,
  });
};

export const syncAuthenticatedUser = (username: string) => {
  saveAuth({
    ...authState,
    isAuthenticated: true,
    username,
  });
};

export const clearAuthState = () => {
  saveAuth({ isAuthenticated: false });
};

export const logout = async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  clearAuthState();
  globalThis.location.href = "/login";
};

export const getAuthHeaders = (): HeadersInit => ({});

// Create the auth context
interface AuthContextValue {
  auth: AuthState;
  loginSuccess: (username: string, apiKey?: string) => void;
  syncAuthenticatedUser: (username: string) => void;
  clearAuthState: () => void;
  logout: () => Promise<void>;
  getAuthHeaders: () => HeadersInit;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(authState);
  useEffect(() => {
    reactSetAuth = setAuth;
    return () => {
      reactSetAuth = null;
    };
  }, []);
  const value = useMemo<AuthContextValue>(
    () => ({
      auth,
      loginSuccess,
      syncAuthenticatedUser,
      clearAuthState,
      logout,
      getAuthHeaders,
    }),
    [auth],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook to use auth context in components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Getter function that works outside of React components (e.g., in router loaders)
export function getAuthState(): AuthState {
  return authState;
}
