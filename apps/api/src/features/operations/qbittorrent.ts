import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Deferred, Effect, Layer, Ref, Schema } from "effect";

import { ClockService } from "@/lib/clock.ts";
import { ExternalCallError, makeTryExternalEffect } from "@/lib/effect-retry.ts";
import {
  authorizedRequest,
  ensureOk,
  makeExecute,
  makeLogin,
  makePostHashesAction,
  resolveUrl,
  type SessionEntry,
  withSessionCache,
} from "@/features/operations/qbittorrent-support.ts";
import {
  QBitTorrentClientError,
  type QBitConfig,
} from "@/features/operations/qbittorrent-models.ts";

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

export const QBitTorrentClientLive = Layer.effect(
  QBitTorrentClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const clock = yield* ClockService;
    const tryExternalEffect = makeTryExternalEffect(clock);
    const sessionsRef = yield* Ref.make<Map<string, SessionEntry>>(new Map());
    const sessionLoginRef = yield* Ref.make<
      Map<string, Deferred.Deferred<string, ExternalCallError | QBitTorrentClientError>>
    >(new Map());

    const execute = makeExecute(client, tryExternalEffect);
    const login = makeLogin(execute);
    const withSession = withSessionCache(sessionsRef, sessionLoginRef, clock, login);
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
