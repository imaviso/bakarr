import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Deferred, Effect, Either, Ref } from "effect";

import type { ClockService } from "@/lib/clock.ts";
import { ExternalCallError, makeTryExternalEffect } from "@/lib/effect-retry.ts";
import {
  QBitTorrentClientError,
  type QBitConfig,
} from "@/features/operations/qbittorrent-models.ts";

export interface SessionEntry {
  readonly cookie: string;
  readonly createdAt: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000;

export function isUnauthorizedStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function getSessionKey(config: QBitConfig): string {
  return `${config.baseUrl}:${config.username}`;
}

export function withSessionCache(
  sessionsRef: Ref.Ref<Map<string, SessionEntry>>,
  sessionLoginRef: Ref.Ref<
    Map<string, Deferred.Deferred<string, ExternalCallError | QBitTorrentClientError>>
  >,
  clock: typeof ClockService.Service,
  login: (config: QBitConfig) => Effect.Effect<string, ExternalCallError | QBitTorrentClientError>,
) {
  type LoginGate = {
    readonly deferred: Deferred.Deferred<string, ExternalCallError | QBitTorrentClientError>;
    readonly leader: boolean;
  };

  const acquireFreshSessionCookie = Effect.fn("QBitTorrentClient.acquireFreshSessionCookie")(
    function* (config: QBitConfig, sessionKey: string) {
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<
            string,
            ExternalCallError | QBitTorrentClientError
          >();
          const gate = yield* Ref.modify(
            sessionLoginRef,
            (
              map,
            ): readonly [
              LoginGate,
              Map<string, Deferred.Deferred<string, ExternalCallError | QBitTorrentClientError>>,
            ] => {
              const existing = map.get(sessionKey);

              if (existing) {
                return [{ deferred: existing, leader: false }, map] as const;
              }

              const next = new Map(map);
              next.set(sessionKey, deferred);
              return [{ deferred, leader: true }, next] as const;
            },
          );

          if (!gate.leader) {
            return yield* restore(Deferred.await(gate.deferred));
          }

          const loginExit = yield* Effect.exit(restore(login(config)));

          if (loginExit._tag === "Success") {
            const createdAt = yield* restore(clock.currentTimeMillis);

            yield* Ref.update(sessionsRef, (map) => {
              const next = new Map(map);
              next.set(sessionKey, { cookie: loginExit.value, createdAt });
              return next;
            });
            yield* Deferred.succeed(gate.deferred, loginExit.value);
            yield* Ref.update(sessionLoginRef, (map) => {
              const next = new Map(map);
              next.delete(sessionKey);
              return next;
            });

            return loginExit.value;
          }

          yield* Deferred.failCause(gate.deferred, loginExit.cause);
          yield* Ref.update(sessionLoginRef, (map) => {
            const next = new Map(map);
            next.delete(sessionKey);
            return next;
          });

          return yield* Effect.failCause(loginExit.cause);
        }),
      );
    },
  );

  return Effect.fn("QBitTorrentClient.withSessionCache")(function* (
    config: QBitConfig,
    operation: (
      cookie: string,
    ) => Effect.Effect<
      HttpClientResponse.HttpClientResponse,
      ExternalCallError | QBitTorrentClientError
    >,
  ) {
    const sessionKey = getSessionKey(config);
    const now = yield* clock.currentTimeMillis;

    const sessions = yield* Ref.get(sessionsRef);
    const cached = sessions.get(sessionKey);

    if (cached && now - cached.createdAt < SESSION_TTL_MS) {
      const response = yield* Effect.either(operation(cached.cookie));

      if (Either.isRight(response)) {
        if (!isUnauthorizedStatus(response.right.status)) {
          return response.right;
        }

        yield* Ref.update(sessionsRef, (map) => {
          const next = new Map(map);
          next.delete(sessionKey);
          return next;
        });
      } else {
        return yield* response.left;
      }
    }

    const newCookie = yield* acquireFreshSessionCookie(config, sessionKey);

    return yield* operation(newCookie);
  });
}

export const makeLogin = (execute: ReturnType<typeof makeExecute>) =>
  Effect.fn("QBitTorrentClient.login")(function* (config: QBitConfig) {
    const response = yield* execute(
      "qbit.login",
      HttpClientRequest.post(resolveUrl(config.baseUrl, "/api/v2/auth/login")).pipe(
        HttpClientRequest.setHeader("Referer", config.baseUrl),
        HttpClientRequest.bodyUrlParams({
          password: config.password,
          username: config.username,
        }),
      ),
    );
    const text = yield* response.text.pipe(
      Effect.mapError((cause) =>
        QBitTorrentClientError.make({
          cause,
          message: "Failed to read qBittorrent login response",
        }),
      ),
    );

    if (response.status < 200 || response.status >= 300 || !text.includes("Ok")) {
      return yield* QBitTorrentClientError.make({
        message: "qBittorrent authentication failed",
      });
    }

    const cookie = response.headers["set-cookie"];

    if (!cookie) {
      return yield* QBitTorrentClientError.make({
        message: "qBittorrent did not return a session cookie",
      });
    }

    const [sessionCookie] = cookie.split(";");
    if (!sessionCookie) {
      return yield* QBitTorrentClientError.make({
        message: "qBittorrent returned an invalid session cookie",
      });
    }

    return sessionCookie;
  });

export const makePostHashesAction = (
  withSession: ReturnType<typeof withSessionCache>,
  execute: ReturnType<typeof makeExecute>,
) =>
  Effect.fn("QBitTorrentClient.postHashesAction")(function* (
    config: QBitConfig,
    path: string,
    hash: string,
  ) {
    const response = yield* withSession(config, (cookie) =>
      execute(
        "qbit.postHashesAction",
        authorizedRequest(
          config,
          cookie,
          HttpClientRequest.post(resolveUrl(config.baseUrl, path)).pipe(
            HttpClientRequest.bodyUrlParams({ hashes: hash }),
          ),
        ),
        { idempotent: false },
      ),
    );

    yield* ensureOk(response, `qBittorrent action failed with status ${response.status}`);
  });

export function makeExecute(
  client: HttpClient.HttpClient,
  tryExternalEffect: ReturnType<typeof makeTryExternalEffect>,
) {
  return (
    operation: string,
    request: HttpClientRequest.HttpClientRequest,
    options?: { readonly idempotent?: boolean },
  ) => tryExternalEffect(operation, client.execute(request), options)();
}

export function ensureOk(response: HttpClientResponse.HttpClientResponse, message: string) {
  return response.status >= 200 && response.status < 300
    ? Effect.void
    : Effect.fail(QBitTorrentClientError.make({ message }));
}

export function resolveUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export function authorizedRequest(
  config: QBitConfig,
  cookie: string,
  request: HttpClientRequest.HttpClientRequest,
) {
  return request.pipe(
    HttpClientRequest.setHeaders({
      Cookie: cookie,
      Referer: config.baseUrl,
    }),
  );
}
