import { Context, Effect, Layer } from "effect";

import type { Config } from "@packages/shared/index.ts";
import {
  QBitTorrentClient,
  type QBitTorrent,
  type QBitTorrentFile,
} from "@/features/operations/qbittorrent/qbittorrent.ts";
import {
  QBitConfigModel,
  QBitTorrentClientError,
  type QBitConfig,
} from "@/features/operations/qbittorrent/qbittorrent-models.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
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

  if (!config.qbittorrent.password && config.qbittorrent.trusted_local !== true) {
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
      password: config.qbittorrent.password ?? "",
      ratioLimit: config.qbittorrent.ratio_limit ?? undefined,
      savePath: config.qbittorrent.save_path || undefined,
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

    const withQBitConfig = Effect.fn("TorrentClientService.withQBitConfig")(function* <A>(
      run: (config: QBitConfig) => Effect.Effect<A, ExternalCallError | QBitTorrentClientError>,
    ) {
      const qbitConfig = yield* resolveConfig();
      if (qbitConfig._tag === "Disabled") {
        return { _tag: "Disabled" } as const;
      }

      return yield* run(qbitConfig.config);
    });

    const addTorrentUrlIfEnabled = Effect.fn("TorrentClientService.addTorrentUrlIfEnabled")(
      function* (url: string) {
        return yield* withQBitConfig((config) =>
          qbitClient.addTorrentUrl(config, url).pipe(Effect.as({ _tag: "Added" } as const)),
        );
      },
    );

    const listTorrentsIfEnabled = Effect.fn("TorrentClientService.listTorrentsIfEnabled")(
      function* () {
        return yield* withQBitConfig((config) =>
          qbitClient.listTorrents(config).pipe(
            Effect.map(
              (torrents) =>
                ({
                  _tag: "Found",
                  torrents,
                }) as const,
            ),
          ),
        );
      },
    );

    const listTorrentContentsIfEnabled = Effect.fn(
      "TorrentClientService.listTorrentContentsIfEnabled",
    )(function* (hash: string) {
      return yield* withQBitConfig((config) =>
        qbitClient.listTorrentContents(config, hash).pipe(
          Effect.map(
            (files) =>
              ({
                _tag: "Found",
                files,
              }) as const,
          ),
        ),
      );
    });

    const pauseTorrentIfEnabled = Effect.fn("TorrentClientService.pauseTorrentIfEnabled")(
      function* (hash: string) {
        return yield* withQBitConfig((config) =>
          qbitClient.pauseTorrent(config, hash).pipe(Effect.as({ _tag: "Paused" } as const)),
        );
      },
    );

    const resumeTorrentIfEnabled = Effect.fn("TorrentClientService.resumeTorrentIfEnabled")(
      function* (hash: string) {
        return yield* withQBitConfig((config) =>
          qbitClient.resumeTorrent(config, hash).pipe(Effect.as({ _tag: "Resumed" } as const)),
        );
      },
    );

    const deleteTorrentIfEnabled = Effect.fn("TorrentClientService.deleteTorrentIfEnabled")(
      function* (hash: string, deleteFiles: boolean) {
        return yield* withQBitConfig((config) =>
          qbitClient
            .deleteTorrent(config, hash, deleteFiles)
            .pipe(Effect.as({ _tag: "Deleted" } as const)),
        );
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
