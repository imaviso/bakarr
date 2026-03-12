import { Context, Either, Effect, Layer, Schema } from "effect";

import { ExternalCallError, tryExternal } from "../../lib/effect-retry.ts";

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
  ) => Effect.Effect<readonly QBitTorrent[], ExternalCallError | QBitTorrentClientError>;
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

const addTorrentUrl = Effect.fn("QBitTorrentClient.addTorrentUrl")(
  function* (config: QBitConfig, url: string) {
    const cookie = yield* login(config);
    const body = new URLSearchParams();

    body.set("urls", url);

    if (config.category) {
      body.set("category", config.category);
    }

    const response = yield* execute(config, "qbit.addTorrentUrl", "/api/v2/torrents/add", {
      body,
      headers: {
        Cookie: cookie,
        Referer: config.baseUrl,
      },
      method: "POST",
    });

    yield* ensureOk(response, `qBittorrent add failed with status ${response.status}`);
  },
);

const listTorrents = Effect.fn("QBitTorrentClient.listTorrents")(
  function* (config: QBitConfig) {
    const cookie = yield* login(config);
    const response = yield* execute(
      config,
      "qbit.listTorrents",
      "/api/v2/torrents/info",
      {
        headers: {
          Cookie: cookie,
          Referer: config.baseUrl,
        },
      },
    );

    yield* ensureOk(
      response,
      `qBittorrent list failed with status ${response.status}`,
    );

    const payload = yield* decodeJson(response, QBitTorrentArraySchema, "qbit.listTorrents.json");
    return payload;
  },
);

const pauseTorrent = Effect.fn("QBitTorrentClient.pauseTorrent")(
  function* (config: QBitConfig, hash: string) {
    yield* postHashesAction(config, "/api/v2/torrents/pause", hash);
  },
);

const resumeTorrent = Effect.fn("QBitTorrentClient.resumeTorrent")(
  function* (config: QBitConfig, hash: string) {
    yield* postHashesAction(config, "/api/v2/torrents/resume", hash);
  },
);

const deleteTorrent = Effect.fn("QBitTorrentClient.deleteTorrent")(
  function* (config: QBitConfig, hash: string, deleteFiles: boolean) {
    const cookie = yield* login(config);
    const body = new URLSearchParams();
    body.set("hashes", hash);
    body.set("deleteFiles", deleteFiles ? "true" : "false");

    const response = yield* execute(config, "qbit.deleteTorrent", "/api/v2/torrents/delete", {
      body,
      headers: {
        Cookie: cookie,
        Referer: config.baseUrl,
      },
      method: "POST",
    });

    yield* ensureOk(
      response,
      `qBittorrent delete failed with status ${response.status}`,
    );
  },
);

export const QBitTorrentClientLive = Layer.succeed(QBitTorrentClient, {
  addTorrentUrl,
  deleteTorrent,
  listTorrents,
  pauseTorrent,
  resumeTorrent,
} satisfies QBitTorrentClientShape);

function login(config: QBitConfig) {
  return Effect.fn("QBitTorrentClient.login")(function* () {
    const body = new URLSearchParams();
    body.set("username", config.username);
    body.set("password", config.password);

    const response = yield* execute(config, "qbit.login", "/api/v2/auth/login", {
      body,
      headers: {
        Referer: config.baseUrl,
      },
      method: "POST",
    });
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) =>
        QBitTorrentClientError.make({
          cause,
          message: "Failed to read qBittorrent login response",
        }),
    });

    if (!response.ok || !text.includes("Ok")) {
      return yield* Effect.fail(
        QBitTorrentClientError.make({
          message: "qBittorrent authentication failed",
        }),
      );
    }

    const cookie = response.headers.get("set-cookie");

    if (!cookie) {
      return yield* Effect.fail(
        QBitTorrentClientError.make({
          message: "qBittorrent did not return a session cookie",
        }),
      );
    }

    return cookie.split(";")[0];
  })();
}

function postHashesAction(config: QBitConfig, path: string, hash: string) {
  return Effect.fn("QBitTorrentClient.postHashesAction")(function* () {
    const cookie = yield* login(config);
    const body = new URLSearchParams();
    body.set("hashes", hash);

    const response = yield* execute(config, "qbit.postHashesAction", path, {
      body,
      headers: {
        Cookie: cookie,
        Referer: config.baseUrl,
      },
      method: "POST",
    });

    yield* ensureOk(
      response,
      `qBittorrent action failed with status ${response.status}`,
    );
  })();
}

function execute(config: QBitConfig, operation: string, path: string, init: RequestInit) {
  return tryExternal(operation, (signal) =>
    fetch(resolveUrl(config.baseUrl, path), {
      ...init,
      signal,
    })
  )().pipe(
    Effect.mapError((cause) =>
      cause instanceof ExternalCallError
        ? cause
        : ExternalCallError.make({
          cause,
          message: `External call failed: ${operation}`,
          operation,
        })
    ),
  );
}

function ensureOk(response: Response, message: string) {
  return response.ok
    ? Effect.void
    : Effect.fail(QBitTorrentClientError.make({ message }));
}

function decodeJson<A, I>(
  response: Response,
  schema: Schema.Schema<A, I>,
  operation: string,
) {
  return Effect.fn(`QBitTorrentClient.${operation}`)(function* () {
    const payload = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) =>
        QBitTorrentClientError.make({
          cause,
          message: "Failed to decode qBittorrent JSON response",
        }),
    });
    const decoded = Schema.decodeUnknownEither(schema)(payload);

    if (Either.isLeft(decoded)) {
      return yield* Effect.fail(
        QBitTorrentClientError.make({
          cause: decoded.left,
          message: "qBittorrent response schema mismatch",
        }),
      );
    }

    return decoded.right;
  })();
}

function resolveUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}
