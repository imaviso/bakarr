import { Context, Effect, Layer } from "effect";

import type { Config } from "@packages/shared/index.ts";
import {
  QBitTorrentClient,
  type QBitTorrent,
  type QBitTorrentFile,
} from "@/features/operations/qbittorrent.ts";
import {
  QBitConfigModel,
  QBitTorrentClientError,
  type QBitConfig,
} from "@/features/operations/qbittorrent-models.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";
import { OperationsInputError } from "@/features/operations/errors.ts";

type TorrentClientServiceError =
  | ExternalCallError
  | OperationsInputError
  | QBitTorrentClientError
  | RuntimeConfigSnapshotError;

type TorrentClientConfigState =
  | {
      readonly _tag: "Disabled";
    }
  | {
      readonly _tag: "Enabled";
      readonly config: QBitConfig;
    };

export interface TorrentClientServiceShape {
  readonly addTorrentUrlIfEnabled: (
    url: string,
  ) => Effect.Effect<{ readonly _tag: "Disabled" | "Added" }, TorrentClientServiceError>;
  readonly deleteTorrentIfEnabled: (
    hash: string,
    deleteFiles: boolean,
  ) => Effect.Effect<{ readonly _tag: "Deleted" | "Disabled" }, TorrentClientServiceError>;
  readonly listTorrentContentsIfEnabled: (
    hash: string,
  ) => Effect.Effect<
    | { readonly _tag: "Disabled" }
    | { readonly _tag: "Found"; readonly files: readonly QBitTorrentFile[] },
    TorrentClientServiceError
  >;
  readonly listTorrentsIfEnabled: () => Effect.Effect<
    | { readonly _tag: "Disabled" }
    | { readonly _tag: "Found"; readonly torrents: readonly QBitTorrent[] },
    TorrentClientServiceError
  >;
  readonly pauseTorrentIfEnabled: (
    hash: string,
  ) => Effect.Effect<{ readonly _tag: "Disabled" | "Paused" }, TorrentClientServiceError>;
  readonly resumeTorrentIfEnabled: (
    hash: string,
  ) => Effect.Effect<{ readonly _tag: "Disabled" | "Resumed" }, TorrentClientServiceError>;
}

export class TorrentClientService extends Context.Tag("@bakarr/api/TorrentClientService")<
  TorrentClientService,
  TorrentClientServiceShape
>() {}

const maybeQBitConfig = (config: Config) => {
  if (!config.qbittorrent.enabled) {
    return { _tag: "Disabled" } as const;
  }

  if (!config.qbittorrent.password) {
    return {
      _tag: "InvalidConfig",
      reason: "qBittorrent is enabled but password is missing",
    } as const;
  }

  return {
    _tag: "Enabled",
    config: new QBitConfigModel({
      baseUrl: config.qbittorrent.url,
      category: config.qbittorrent.default_category,
      password: config.qbittorrent.password,
      username: config.qbittorrent.username,
    }),
  } as const;
};

export const TorrentClientServiceLive = Layer.effect(
  TorrentClientService,
  Effect.gen(function* () {
    const qbitClient = yield* QBitTorrentClient;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    const resolveConfig = Effect.fn("TorrentClientService.resolveConfig")(function* () {
      const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
      const state = maybeQBitConfig(runtimeConfig);

      if (state._tag === "InvalidConfig") {
        return yield* new OperationsInputError({
          message: state.reason,
        });
      }

      return state satisfies TorrentClientConfigState;
    });

    const addTorrentUrlIfEnabled = Effect.fn("TorrentClientService.addTorrentUrlIfEnabled")(
      function* (url: string) {
        const qbitConfig = yield* resolveConfig();
        if (qbitConfig._tag === "Disabled") {
          return { _tag: "Disabled" } as const;
        }

        yield* qbitClient.addTorrentUrl(qbitConfig.config, url);
        return { _tag: "Added" } as const;
      },
    );

    const listTorrentsIfEnabled = Effect.fn("TorrentClientService.listTorrentsIfEnabled")(
      function* () {
        const qbitConfig = yield* resolveConfig();
        if (qbitConfig._tag === "Disabled") {
          return { _tag: "Disabled" } as const;
        }

        const torrents = yield* qbitClient.listTorrents(qbitConfig.config);
        return { _tag: "Found", torrents } as const;
      },
    );

    const listTorrentContentsIfEnabled = Effect.fn(
      "TorrentClientService.listTorrentContentsIfEnabled",
    )(function* (hash: string) {
      const qbitConfig = yield* resolveConfig();
      if (qbitConfig._tag === "Disabled") {
        return { _tag: "Disabled" } as const;
      }

      const files = yield* qbitClient.listTorrentContents(qbitConfig.config, hash);
      return { _tag: "Found", files } as const;
    });

    const pauseTorrentIfEnabled = Effect.fn("TorrentClientService.pauseTorrentIfEnabled")(
      function* (hash: string) {
        const qbitConfig = yield* resolveConfig();
        if (qbitConfig._tag === "Disabled") {
          return { _tag: "Disabled" } as const;
        }

        yield* qbitClient.pauseTorrent(qbitConfig.config, hash);
        return { _tag: "Paused" } as const;
      },
    );

    const resumeTorrentIfEnabled = Effect.fn("TorrentClientService.resumeTorrentIfEnabled")(
      function* (hash: string) {
        const qbitConfig = yield* resolveConfig();
        if (qbitConfig._tag === "Disabled") {
          return { _tag: "Disabled" } as const;
        }

        yield* qbitClient.resumeTorrent(qbitConfig.config, hash);
        return { _tag: "Resumed" } as const;
      },
    );

    const deleteTorrentIfEnabled = Effect.fn("TorrentClientService.deleteTorrentIfEnabled")(
      function* (hash: string, deleteFiles: boolean) {
        const qbitConfig = yield* resolveConfig();
        if (qbitConfig._tag === "Disabled") {
          return { _tag: "Disabled" } as const;
        }

        yield* qbitClient.deleteTorrent(qbitConfig.config, hash, deleteFiles);
        return { _tag: "Deleted" } as const;
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
