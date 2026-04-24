import { Context, Effect, Layer, Option } from "effect";

export interface AuthState {
  readonly username?: string | undefined;
  readonly apiKey?: string | undefined;
  readonly isAuthenticated: boolean;
}

export class AuthService extends Context.Tag("@bakarr/web/AuthService")<
  AuthService,
  {
    readonly getState: Effect.Effect<AuthState>;
    readonly loginSuccess: (username: string, apiKey?: string) => Effect.Effect<void>;
    readonly syncAuthenticatedUser: (username: string) => Effect.Effect<void>;
    readonly clearAuthState: Effect.Effect<void>;
    readonly logout: Effect.Effect<void>;
    readonly normalizeApiKey: (apiKey?: string) => Option.Option<string>;
  }
>() {
  static readonly Live = Layer.effect(
    AuthService,
    Effect.sync(() => {
      let authState: AuthState = { isAuthenticated: false };
      const listeners = new Set<() => void>();

      const emit = () => {
        for (const listener of listeners) {
          listener();
        }
      };

      const normalizeApiKey = (apiKey?: string): Option.Option<string> => {
        const value = apiKey?.trim();
        if (!value || /^\*+$/.test(value)) {
          return Option.none();
        }
        return Option.some(value);
      };

      const getState = Effect.sync(() => authState);

      const loginSuccess = Effect.fn("AuthService.loginSuccess")(
        (username: string, apiKey?: string) =>
          Effect.sync(() => {
            const key = normalizeApiKey(apiKey);
            authState = {
              username,
              apiKey: Option.getOrUndefined(key),
              isAuthenticated: true,
            };
            emit();
          }),
      );

      const syncAuthenticatedUser = Effect.fn("AuthService.syncAuthenticatedUser")(
        (username: string) =>
          Effect.sync(() => {
            authState = { ...authState, isAuthenticated: true, username };
            emit();
          }),
      );

      const clearAuthState = Effect.sync(() => {
        authState = { isAuthenticated: false };
        emit();
      });

      const logout = Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () => fetch("/api/auth/logout", { method: "POST" }),
          catch: () => undefined,
        }).pipe(Effect.ignore);

        authState = { isAuthenticated: false };
        emit();
        globalThis.location.href = "/login";
      });

      return AuthService.of({
        getState,
        loginSuccess,
        syncAuthenticatedUser,
        clearAuthState,
        logout,
        normalizeApiKey,
      });
    }),
  );
}
