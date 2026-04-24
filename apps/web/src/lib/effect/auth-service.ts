import { Context, Effect, Layer } from "effect";
import {
  clearAuthState,
  getAuthState,
  loginSuccess,
  logout,
  syncAuthenticatedUser,
  type AuthState,
} from "~/lib/auth-state";

export { AuthState };

export class AuthService extends Context.Tag("@bakarr/web/AuthService")<
  AuthService,
  {
    readonly getState: Effect.Effect<AuthState>;
    readonly loginSuccess: (username: string, apiKey?: string) => Effect.Effect<void>;
    readonly syncAuthenticatedUser: (username: string) => Effect.Effect<void>;
    readonly clearAuthState: Effect.Effect<void>;
    readonly logout: Effect.Effect<void>;
  }
>() {
  static readonly Live = Layer.succeed(
    AuthService,
    AuthService.of({
      getState: Effect.sync(() => getAuthState()),
      loginSuccess: Effect.fn("AuthService.loginSuccess")((username: string, apiKey?: string) =>
        Effect.sync(() => loginSuccess(username, apiKey)),
      ),
      syncAuthenticatedUser: Effect.fn("AuthService.syncAuthenticatedUser")((username: string) =>
        Effect.sync(() => syncAuthenticatedUser(username)),
      ),
      clearAuthState: Effect.sync(() => clearAuthState()),
      logout: Effect.promise(() => logout()).pipe(Effect.withSpan("AuthService.logout")),
    }),
  );
}
