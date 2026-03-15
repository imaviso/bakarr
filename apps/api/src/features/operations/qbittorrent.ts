import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { Context, Effect, Either, Layer, Schema } from "effect";

import {
  ExternalCallError,
  tryExternalEffect,
} from "../../lib/effect-retry.ts";

export interface QBitConfig {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  readonly category?: string;
}

export interface QBitTorrent {
  readonly hash: string;
  readonly name: string;
  readonly state: string;
  readonly progress: number;
  readonly size: number;
  readonly downloaded: number;
  readonly dlspeed: number;
  readonly eta: number;
  readonly save_path?: string;
  readonly category?: string;
  readonly content_path?: string;
  readonly added_on?: number;
}

interface QBitTorrentClientShape {
  readonly addTorrentUrl: (
    config: QBitConfig,
    url: string,
  ) => Effect.Effect<void, ExternalCallError | QBitTorrentClientError>;
  readonly listTorrents: (
    config: QBitConfig,
  ) => Effect.Effect<
    readonly QBitTorrent[],
    ExternalCallError | QBitTorrentClientError
  >;
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

export class QBitTorrentClientError
  extends Schema.TaggedError<QBitTorrentClientError>()(
    "QBitTorrentClientError",
    {
      cause: Schema.optional(Schema.Defect),
      message: Schema.String,
    },
  ) {}

export class QBitTorrentClient extends Context.Tag(
  "@bakarr/api/QBitTorrentClient",
)<QBitTorrentClient, QBitTorrentClientShape>() {}

const QBitTorrentSchema = Schema.Struct({
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
});

const QBitTorrentArraySchema = Schema.Array(QBitTorrentSchema);

export const QBitTorrentClientLive = Layer.effect(
  QBitTorrentClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const addTorrentUrl = Effect.fn("QBitTorrentClient.addTorrentUrl")(
      function* (config: QBitConfig, url: string) {
        const cookie = yield* login(client, config);
        const response = yield* execute(
          client,
          "qbit.addTorrentUrl",
          authorizedRequest(
            config,
            cookie,
            HttpClientRequest.post(
              resolveUrl(config.baseUrl, "/api/v2/torrents/add"),
            ).pipe(
              HttpClientRequest.bodyUrlParams({
                category: config.category,
                urls: url,
              }),
            ),
          ),
          { idempotent: false },
        );

        yield* ensureOk(
          response,
          `qBittorrent add failed with status ${response.status}`,
        );
      },
    );

    const listTorrents = Effect.fn("QBitTorrentClient.listTorrents")(
      function* (config: QBitConfig) {
        const cookie = yield* login(client, config);
        const response = yield* execute(
          client,
          "qbit.listTorrents",
          authorizedRequest(
            config,
            cookie,
            HttpClientRequest.get(
              resolveUrl(config.baseUrl, "/api/v2/torrents/info"),
            ),
          ),
        );

        yield* ensureOk(
          response,
          `qBittorrent list failed with status ${response.status}`,
        );

        return yield* decodeJson(
          response,
          QBitTorrentArraySchema,
          "qbit.listTorrents.json",
        );
      },
    );

    const pauseTorrent = Effect.fn("QBitTorrentClient.pauseTorrent")(
      function* (config: QBitConfig, hash: string) {
        yield* postHashesAction(client, config, "/api/v2/torrents/pause", hash);
      },
    );

    const resumeTorrent = Effect.fn("QBitTorrentClient.resumeTorrent")(
      function* (config: QBitConfig, hash: string) {
        yield* postHashesAction(
          client,
          config,
          "/api/v2/torrents/resume",
          hash,
        );
      },
    );

    const deleteTorrent = Effect.fn("QBitTorrentClient.deleteTorrent")(
      function* (config: QBitConfig, hash: string, deleteFiles: boolean) {
        const cookie = yield* login(client, config);
        const response = yield* execute(
          client,
          "qbit.deleteTorrent",
          authorizedRequest(
            config,
            cookie,
            HttpClientRequest.post(
              resolveUrl(config.baseUrl, "/api/v2/torrents/delete"),
            ).pipe(
              HttpClientRequest.bodyUrlParams({
                deleteFiles: deleteFiles ? "true" : "false",
                hashes: hash,
              }),
            ),
          ),
          { idempotent: false },
        );

        yield* ensureOk(
          response,
          `qBittorrent delete failed with status ${response.status}`,
        );
      },
    );

    return {
      addTorrentUrl,
      deleteTorrent,
      listTorrents,
      pauseTorrent,
      resumeTorrent,
    } satisfies QBitTorrentClientShape;
  }),
);

const login = Effect.fn("QBitTorrentClient.login")(
  function* (client: HttpClient.HttpClient, config: QBitConfig) {
    const response = yield* execute(
      client,
      "qbit.login",
      HttpClientRequest.post(resolveUrl(config.baseUrl, "/api/v2/auth/login"))
        .pipe(
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
        })
      ),
    );

    if (
      response.status < 200 || response.status >= 300 || !text.includes("Ok")
    ) {
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
  },
);

const postHashesAction = Effect.fn("QBitTorrentClient.postHashesAction")(
  function* (
    client: HttpClient.HttpClient,
    config: QBitConfig,
    path: string,
    hash: string,
  ) {
    const cookie = yield* login(client, config);
    const response = yield* execute(
      client,
      "qbit.postHashesAction",
      authorizedRequest(
        config,
        cookie,
        HttpClientRequest.post(resolveUrl(config.baseUrl, path)).pipe(
          HttpClientRequest.bodyUrlParams({ hashes: hash }),
        ),
      ),
      { idempotent: false },
    );

    yield* ensureOk(
      response,
      `qBittorrent action failed with status ${response.status}`,
    );
  },
);

function execute(
  client: HttpClient.HttpClient,
  operation: string,
  request: HttpClientRequest.HttpClientRequest,
  options?: { readonly idempotent?: boolean },
) {
  return tryExternalEffect(operation, client.execute(request), options)();
}

function ensureOk(
  response: HttpClientResponse.HttpClientResponse,
  message: string,
) {
  return response.status >= 200 && response.status < 300
    ? Effect.void
    : Effect.fail(QBitTorrentClientError.make({ message }));
}

function decodeJson<A, I>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Schema<A, I>,
  operation: string,
) {
  return Effect.gen(function* () {
    const payload = yield* response.json.pipe(
      Effect.mapError((cause) =>
        QBitTorrentClientError.make({
          cause,
          message: "Failed to decode qBittorrent JSON response",
        })
      ),
    );
    const decoded = Schema.decodeUnknownEither(schema)(payload);

    if (Either.isLeft(decoded)) {
      return yield* QBitTorrentClientError.make({
        cause: decoded.left,
        message: "qBittorrent response schema mismatch",
      });
    }

    return decoded.right;
  }).pipe(Effect.withSpan(`QBitTorrentClient.${operation}`));
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
