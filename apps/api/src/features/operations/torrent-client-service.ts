import { Context, Effect, Layer } from "effect";

import type { Config } from "@packages/shared/index.ts";
import {
  QBitConfigModel,
  QBitTorrentClient,
  QBitTorrentClientError,
  type QBitTorrent,
  type QBitTorrentFile,
} from "@/features/operations/qbittorrent.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";

type TorrentClientServiceError =
  | ExternalCallError
  | QBitTorrentClientError
  | RuntimeConfigSnapshotError;

export interface TorrentClientServiceShape {
  readonly addTorrentUrlIfEnabled: (
    url: string,
  ) => Effect.Effect<boolean, TorrentClientServiceError>;
  readonly deleteTorrentIfEnabled: (
    hash: string,
    deleteFiles: boolean,
  ) => Effect.Effect<boolean, TorrentClientServiceError>;
  readonly listTorrentContentsIfEnabled: (
    hash: string,
  ) => Effect.Effect<readonly QBitTorrentFile[] | null, TorrentClientServiceError>;
  readonly listTorrentsIfEnabled: () => Effect.Effect<
    readonly QBitTorrent[] | null,
    TorrentClientServiceError
  >;
  readonly pauseTorrentIfEnabled: (
    hash: string,
  ) => Effect.Effect<boolean, TorrentClientServiceError>;
  readonly resumeTorrentIfEnabled: (
    hash: string,
  ) => Effect.Effect<boolean, TorrentClientServiceError>;
}

export class TorrentClientService extends Context.Tag("@bakarr/api/TorrentClientService")<
  TorrentClientService,
  TorrentClientServiceShape
>() {}

const maybeQBitConfig = (config: Config) => {
  if (!config.qbittorrent.enabled || !config.qbittorrent.password) {
    return null;
  }

  return new QBitConfigModel({
    baseUrl: config.qbittorrent.url,
    category: config.qbittorrent.default_category,
    password: config.qbittorrent.password,
    username: config.qbittorrent.username,
  });
};

export const TorrentClientServiceLive = Layer.effect(
  TorrentClientService,
  Effect.gen(function* () {
    const qbitClient = yield* QBitTorrentClient;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    const resolveConfig = Effect.fn("TorrentClientService.resolveConfig")(function* () {
      const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
      return maybeQBitConfig(runtimeConfig);
    });

    const addTorrentUrlIfEnabled = Effect.fn("TorrentClientService.addTorrentUrlIfEnabled")(
      function* (url: string) {
        const qbitConfig = yield* resolveConfig();
        if (!qbitConfig) {
          return false;
        }

        yield* qbitClient.addTorrentUrl(qbitConfig, url);
        return true;
      },
    );

    const listTorrentsIfEnabled = Effect.fn("TorrentClientService.listTorrentsIfEnabled")(
      function* () {
        const qbitConfig = yield* resolveConfig();
        if (!qbitConfig) {
          return null;
        }

        return yield* qbitClient.listTorrents(qbitConfig);
      },
    );

    const listTorrentContentsIfEnabled = Effect.fn(
      "TorrentClientService.listTorrentContentsIfEnabled",
    )(function* (hash: string) {
      const qbitConfig = yield* resolveConfig();
      if (!qbitConfig) {
        return null;
      }

      return yield* qbitClient.listTorrentContents(qbitConfig, hash);
    });

    const pauseTorrentIfEnabled = Effect.fn("TorrentClientService.pauseTorrentIfEnabled")(
      function* (hash: string) {
        const qbitConfig = yield* resolveConfig();
        if (!qbitConfig) {
          return false;
        }

        yield* qbitClient.pauseTorrent(qbitConfig, hash);
        return true;
      },
    );

    const resumeTorrentIfEnabled = Effect.fn("TorrentClientService.resumeTorrentIfEnabled")(
      function* (hash: string) {
        const qbitConfig = yield* resolveConfig();
        if (!qbitConfig) {
          return false;
        }

        yield* qbitClient.resumeTorrent(qbitConfig, hash);
        return true;
      },
    );

    const deleteTorrentIfEnabled = Effect.fn("TorrentClientService.deleteTorrentIfEnabled")(
      function* (hash: string, deleteFiles: boolean) {
        const qbitConfig = yield* resolveConfig();
        if (!qbitConfig) {
          return false;
        }

        yield* qbitClient.deleteTorrent(qbitConfig, hash, deleteFiles);
        return true;
      },
    );

    return TorrentClientService.of({
      addTorrentUrlIfEnabled,
      deleteTorrentIfEnabled,
      listTorrentContentsIfEnabled,
      listTorrentsIfEnabled,
      pauseTorrentIfEnabled,
      resumeTorrentIfEnabled,
    });
  }),
);
