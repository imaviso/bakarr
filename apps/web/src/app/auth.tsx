import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  clearAuthState,
  getAuthHeaders,
  getAuthState,
  loginSuccess,
  logout,
  replaceApiKey,
  subscribeAuth,
  syncAuthenticatedUser,
} from "~/app/auth-state";

export type { AuthState } from "~/app/auth-state";

export {
  getAuthState,
  getAuthHeaders,
  loginSuccess,
  syncAuthenticatedUser,
  clearAuthState,
  logout,
  replaceApiKey,
};

// Create the auth context
interface AuthContextValue {
  auth: ReturnType<typeof getAuthState>;
  loginSuccess: typeof loginSuccess;
  syncAuthenticatedUser: typeof syncAuthenticatedUser;
  clearAuthState: typeof clearAuthState;
  logout: typeof logout;
  replaceApiKey: typeof replaceApiKey;
  getAuthHeaders: typeof getAuthHeaders;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);

  const value = useMemo<AuthContextValue>(
    () => ({
      auth,
      loginSuccess,
      syncAuthenticatedUser,
      clearAuthState,
      logout,
      replaceApiKey,
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
