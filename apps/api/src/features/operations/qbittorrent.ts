import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Either, Layer, Ref, Schema } from "effect";

import { ClockService } from "@/lib/clock.ts";
import { ExternalCallError, makeTryExternalEffect } from "@/lib/effect-retry.ts";

export class QBitConfigModel extends Schema.Class<QBitConfigModel>("QBitConfigModel")({
  baseUrl: Schema.String,
  category: Schema.optional(Schema.String),
  password: Schema.String,
  username: Schema.String,
}) {}

export type QBitConfig = Schema.Schema.Type<typeof QBitConfigModel>;

interface SessionEntry {
  readonly cookie: string;
  readonly createdAt: number;
}

interface QBitTorrentClientShape {
  readonly addTorrentUrl: (
    config: QBitConfig,
    url: string,
  ) => Effect.Effect<void, ExternalCallError | QBitTorrentClientError>;
  readonly listTorrents: (
    config: QBitConfig,
  ) => Effect.Effect<readonly QBitTorrent[], ExternalCallError | QBitTorrentClientError>;
  readonly listTorrentContents: (
    config: QBitConfig,
    hash: string,
  ) => Effect.Effect<readonly QBitTorrentFile[], ExternalCallError | QBitTorrentClientError>;
  readonly pauseTorrent: (
    config: QBitConfig,
    hash: string,
  ) => Effect.Effect<void, ExternalCallError | QBitTorrentClientError>;
  readonly resumeTorrent: (
    config: QBitConfig,
    hash: string,
  ) => Effect.Effect<void, ExternalCallError | QBitTorrentClientError>;
  readonly deleteTorrent: (
    config: QBitConfig,
    hash: string,
    deleteFiles: boolean,
  ) => Effect.Effect<void, ExternalCallError | QBitTorrentClientError>;
}

export class QBitTorrentClientError extends Schema.TaggedError<QBitTorrentClientError>()(
  "QBitTorrentClientError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  },
) {}

export class QBitTorrentClient extends Context.Tag("@bakarr/api/QBitTorrentClient")<
  QBitTorrentClient,
  QBitTorrentClientShape
>() {}

class QBitTorrentSchema extends Schema.Class<QBitTorrentSchema>("QBitTorrentSchema")({
  added_on: Schema.optional(Schema.Number),
  category: Schema.optional(Schema.String),
  content_path: Schema.optional(Schema.String),
  downloaded: Schema.Number,
  dlspeed: Schema.Number,
  eta: Schema.Number,
  hash: Schema.String,
  name: Schema.String,
  progress: Schema.Number,
  save_path: Schema.optional(Schema.String),
  size: Schema.Number,
  state: Schema.String,
}) {}

export type QBitTorrent = Schema.Schema.Type<typeof QBitTorrentSchema>;

const QBitTorrentArraySchema = Schema.Array(QBitTorrentSchema);

class QBitTorrentFileSchema extends Schema.Class<QBitTorrentFileSchema>("QBitTorrentFileSchema")({
  availability: Schema.optional(Schema.Number),
  index: Schema.optional(Schema.Number),
  is_seed: Schema.Boolean,
  name: Schema.String,
  piece_range: Schema.optional(Schema.Array(Schema.Number)),
  priority: Schema.Number,
  progress: Schema.Number,
  size: Schema.Number,
}) {}

export type QBitTorrentFile = Schema.Schema.Type<typeof QBitTorrentFileSchema>;

const QBitTorrentFileArraySchema = Schema.Array(QBitTorrentFileSchema);

const SESSION_TTL_MS = 30 * 60 * 1000;

function isUnauthorizedStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function getSessionKey(config: QBitConfig): string {
  return `${config.baseUrl}:${config.username}`;
}

function withSessionCache(
  sessionsRef: Ref.Ref<Map<string, SessionEntry>>,
  clock: typeof ClockService.Service,
  login: (config: QBitConfig) => Effect.Effect<string, ExternalCallError | QBitTorrentClientError>,
) {
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
      } else {
        return yield* response.left;
      }
    }

    const newCookie = yield* login(config);
    const createdAt = yield* clock.currentTimeMillis;
    yield* Ref.update(sessionsRef, (map) => {
      const newMap = new Map(map);
      newMap.set(sessionKey, { cookie: newCookie, createdAt });
      return newMap;
    });

    return yield* operation(newCookie);
  });
}

export const QBitTorrentClientLive = Layer.effect(
  QBitTorrentClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const clock = yield* ClockService;
    const tryExternalEffect = makeTryExternalEffect(clock);
    const sessionsRef = yield* Ref.make<Map<string, SessionEntry>>(new Map());

    const execute = makeExecute(client, tryExternalEffect);
    const login = makeLogin(execute);
    const withSession = withSessionCache(sessionsRef, clock, login);
    const postHashesAction = makePostHashesAction(withSession, execute);

    const addTorrentUrl = Effect.fn("QBitTorrentClient.addTorrentUrl")(function* (
      config: QBitConfig,
      url: string,
    ) {
      const response = yield* withSession(config, (cookie) =>
        execute(
          "qbit.addTorrentUrl",
          authorizedRequest(
            config,
            cookie,
            HttpClientRequest.post(resolveUrl(config.baseUrl, "/api/v2/torrents/add")).pipe(
              HttpClientRequest.bodyUrlParams({
                category: config.category,
                urls: url,
              }),
            ),
          ),
          { idempotent: false },
        ),
      );

      yield* ensureOk(response, `qBittorrent add failed with status ${response.status}`);
    });

    const listTorrents = Effect.fn("QBitTorrentClient.listTorrents")(function* (
      config: QBitConfig,
    ) {
      const response = yield* withSession(config, (cookie) =>
        execute(
          "qbit.listTorrents",
          authorizedRequest(
            config,
            cookie,
            HttpClientRequest.get(resolveUrl(config.baseUrl, "/api/v2/torrents/info")),
          ),
        ),
      );

      yield* ensureOk(response, `qBittorrent list failed with status ${response.status}`);

      return yield* HttpClientResponse.schemaBodyJson(QBitTorrentArraySchema)(response).pipe(
        Effect.mapError((cause) =>
          QBitTorrentClientError.make({
            cause,
            message: "Failed to decode qBittorrent list response",
          }),
        ),
      );
    });

    const listTorrentContents = Effect.fn("QBitTorrentClient.listTorrentContents")(function* (
      config: QBitConfig,
      hash: string,
    ) {
      const response = yield* withSession(config, (cookie) =>
        execute(
          "qbit.listTorrentContents",
          authorizedRequest(
            config,
            cookie,
            HttpClientRequest.get(
              resolveUrl(config.baseUrl, `/api/v2/torrents/files?hash=${hash}`),
            ),
          ),
        ),
      );

      yield* ensureOk(
        response,
        `qBittorrent torrent contents failed with status ${response.status}`,
      );

      return yield* HttpClientResponse.schemaBodyJson(QBitTorrentFileArraySchema)(response).pipe(
        Effect.mapError((cause) =>
          QBitTorrentClientError.make({
            cause,
            message: "Failed to decode qBittorrent torrent contents response",
          }),
        ),
      );
    });

    const pauseTorrent = Effect.fn("QBitTorrentClient.pauseTorrent")(function* (
      config: QBitConfig,
      hash: string,
    ) {
      yield* postHashesAction(config, "/api/v2/torrents/pause", hash);
    });

    const resumeTorrent = Effect.fn("QBitTorrentClient.resumeTorrent")(function* (
      config: QBitConfig,
      hash: string,
    ) {
      yield* postHashesAction(config, "/api/v2/torrents/resume", hash);
    });

    const deleteTorrent = Effect.fn("QBitTorrentClient.deleteTorrent")(function* (
      config: QBitConfig,
      hash: string,
      deleteFiles: boolean,
    ) {
      const response = yield* withSession(config, (cookie) =>
        execute(
          "qbit.deleteTorrent",
          authorizedRequest(
            config,
            cookie,
            HttpClientRequest.post(resolveUrl(config.baseUrl, "/api/v2/torrents/delete")).pipe(
              HttpClientRequest.bodyUrlParams({
                deleteFiles: deleteFiles ? "true" : "false",
                hashes: hash,
              }),
            ),
          ),
          { idempotent: false },
        ),
      );

      yield* ensureOk(response, `qBittorrent delete failed with status ${response.status}`);
    });

    return {
      addTorrentUrl,
      deleteTorrent,
      listTorrentContents,
      listTorrents,
      pauseTorrent,
      resumeTorrent,
    } satisfies QBitTorrentClientShape;
  }),
);

const makeLogin = (execute: ReturnType<typeof makeExecute>) =>
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

    return cookie.split(";")[0];
  });

const makePostHashesAction = (
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

function makeExecute(
  client: HttpClient.HttpClient,
  tryExternalEffect: ReturnType<typeof makeTryExternalEffect>,
) {
  return (
    operation: string,
    request: HttpClientRequest.HttpClientRequest,
    options?: { readonly idempotent?: boolean },
  ) => tryExternalEffect(operation, client.execute(request), options)();
}

function ensureOk(response: HttpClientResponse.HttpClientResponse, message: string) {
  return response.status >= 200 && response.status < 300
    ? Effect.void
    : Effect.fail(QBitTorrentClientError.make({ message }));
}

function resolveUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function authorizedRequest(
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
