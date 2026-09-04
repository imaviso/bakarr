import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { currentTimeMillis } from "@/infra/time.ts";
import { ExternalCallError, type ExternalCallShape } from "@/infra/effect/retry.ts";
import { Deferred, Effect, HashMap, Option, Ref, Result } from "effect";
import {
  QBitTorrentClientError,
  qbitPasswordValue,
  type QBitConfig,
} from "@/features/operations/qbittorrent/qbittorrent-models.ts";

export interface SessionEntry {
  readonly cookie: string;
  readonly createdAt: number;
}

type ExecuteQBitRequest = (
  operation: string,
  request: HttpClientRequest.HttpClientRequest,
  options?: { readonly idempotent?: boolean },
) => Effect.Effect<HttpClientResponse.HttpClientResponse, ExternalCallError>;

type WithCachedSession = (
  config: QBitConfig,
  operation: (
    cookie: string,
  ) => Effect.Effect<
    HttpClientResponse.HttpClientResponse,
    ExternalCallError | QBitTorrentClientError
  >,
) => Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  ExternalCallError | QBitTorrentClientError
>;

const SESSION_TTL_MS = 30 * 60 * 1000;

export function isUnauthorizedStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function getSessionKey(config: QBitConfig): string {
  return `${config.baseUrl}:${config.username}`;
}

export function withSessionCache(
  sessionsRef: Ref.Ref<HashMap.HashMap<string, SessionEntry>>,
  sessionLoginRef: Ref.Ref<
    HashMap.HashMap<string, Deferred.Deferred<string, ExternalCallError | QBitTorrentClientError>>
  >,
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
              HashMap.HashMap<
                string,
                Deferred.Deferred<string, ExternalCallError | QBitTorrentClientError>
              >,
            ] => {
              const existing = HashMap.get(map, sessionKey);

              if (Option.isSome(existing)) {
                return [{ deferred: existing.value, leader: false }, map];
              }

              return [{ deferred, leader: true }, HashMap.set(map, sessionKey, deferred)];
            },
          );

          if (!gate.leader) {
            return yield* restore(Deferred.await(gate.deferred));
          }

          const loginExit = yield* Effect.exit(restore(login(config)));

          if (loginExit._tag === "Success") {
            const createdAt = yield* restore(currentTimeMillis);

            yield* Ref.update(sessionsRef, (map) =>
              HashMap.set(map, sessionKey, { cookie: loginExit.value, createdAt }),
            );
            yield* Deferred.succeed(gate.deferred, loginExit.value);
            yield* Ref.update(sessionLoginRef, (map) => HashMap.remove(map, sessionKey));

            return loginExit.value;
          }

          yield* Deferred.failCause(gate.deferred, loginExit.cause);
          yield* Ref.update(sessionLoginRef, (map) => HashMap.remove(map, sessionKey));

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
    const now = yield* currentTimeMillis;

    const sessions = yield* Ref.get(sessionsRef);
    const cachedOption = HashMap.get(sessions, sessionKey);

    if (Option.isSome(cachedOption) && now - cachedOption.value.createdAt < SESSION_TTL_MS) {
      const response = yield* Effect.result(operation(cachedOption.value.cookie));

      if (Result.isSuccess(response)) {
        if (!isUnauthorizedStatus(response.success.status)) {
          return response.success;
        }

        yield* Ref.update(sessionsRef, (map) => HashMap.remove(map, sessionKey));
      } else {
        return yield* response.failure;
      }
    }

    const newCookie = yield* Effect.result(acquireFreshSessionCookie(config, sessionKey));

    if (Result.isSuccess(newCookie)) {
      return yield* operation(newCookie.success);
    }

    if (!isAuthenticationFailure(newCookie.failure)) {
      return yield* newCookie.failure;
    }

    const response = yield* operation("");

    if (!isUnauthorizedStatus(response.status)) {
      const createdAt = yield* currentTimeMillis;
      yield* Ref.update(sessionsRef, (map) =>
        HashMap.set(map, sessionKey, { cookie: "", createdAt }),
      );
    }

    return response;
  });
}

function isAuthenticationFailure(error: ExternalCallError | QBitTorrentClientError) {
  return (
    error instanceof QBitTorrentClientError && error.message === "qBittorrent authentication failed"
  );
}

export const makeLogin = (execute: ExecuteQBitRequest) =>
  Effect.fn("QBitTorrentClient.login")(function* (config: QBitConfig) {
    const response = yield* execute(
      "qbit.login",
      HttpClientRequest.post(resolveUrl(config.baseUrl, "/api/v2/auth/login")).pipe(
        HttpClientRequest.setHeader("Referer", config.baseUrl),
        HttpClientRequest.bodyUrlParams({
          password: qbitPasswordValue(config),
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

    if (response.status < 200 || response.status >= 300) {
      return yield* QBitTorrentClientError.make({
        message: "qBittorrent authentication failed",
      });
    }

    // qBittorrent < 4.6 answers plain "Ok."; qBittorrent >= 5.0 answers HTTP
    // 204 with an empty body. Both are successful logins.
    const isOkText = text.includes("Ok");
    const isModernEmptyLogin = response.status === 204 && text.trim().length === 0;

    if (!isOkText && !isModernEmptyLogin) {
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

/**
 * qBittorrent >= 5.0 renamed `/torrents/pause|resume` to `/torrents/stop|start`.
 * Try the modern path first and fall back to the legacy path on 404 so both
 * major versions work.
 */
export const makePostHashesActionWithFallback = (
  withSession: WithCachedSession,
  execute: ExecuteQBitRequest,
) =>
  Effect.fn("QBitTorrentClient.postHashesActionWithFallback")(function* (
    config: QBitConfig,
    modernPath: string,
    legacyPath: string,
    hash: string,
  ) {
    const post = (path: string) =>
      withSession(config, (cookie) =>
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

    const response = yield* post(modernPath);
    if (response.status === 404) {
      const legacyResponse = yield* post(legacyPath);
      yield* ensureOk(
        legacyResponse,
        `qBittorrent action failed with status ${legacyResponse.status}`,
      );
      return;
    }

    yield* ensureOk(response, `qBittorrent action failed with status ${response.status}`);
  });

export function makeExecute(
  client: HttpClient.HttpClient,
  tryExternalEffect: ExternalCallShape["tryExternalEffect"],
) {
  return (
    operation: string,
    request: HttpClientRequest.HttpClientRequest,
    options?: { readonly idempotent?: boolean },
  ) => tryExternalEffect(operation, client.execute(request), options);
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
