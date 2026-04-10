import { type Accessor, createContext, createSignal, type JSX, useContext } from "solid-js";

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
const [auth, setAuth] = createSignal<AuthState>({ isAuthenticated: false });

function saveAuth(state: AuthState) {
  setAuth(state);
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
    ...auth(),
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
  auth: Accessor<AuthState>;
  loginSuccess: (username: string, apiKey?: string) => void;
  syncAuthenticatedUser: (username: string) => void;
  clearAuthState: () => void;
  logout: () => Promise<void>;
  getAuthHeaders: () => HeadersInit;
}

const AuthContext = createContext<AuthContextValue>();

const authContextValue: AuthContextValue = {
  auth,
  loginSuccess,
  syncAuthenticatedUser,
  clearAuthState,
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
