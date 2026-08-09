import { Effect, Redacted } from "effect";

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
import { DomainInputError } from "@/features/errors.ts";

type TorrentClientServiceError =
  | ExternalCallError
  | DomainInputError
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

type QBitDisabledResult = { readonly _tag: "Disabled" };

export interface TorrentClientServiceShape {
  readonly addTorrentUrlIfEnabled: (
    url: string,
  ) => Effect.Effect<QBitDisabledResult | { readonly _tag: "Added" }, TorrentClientServiceError>;
  readonly deleteTorrentIfEnabled: (
    hash: string,
    deleteFiles: boolean,
  ) => Effect.Effect<QBitDisabledResult | { readonly _tag: "Deleted" }, TorrentClientServiceError>;
  readonly listTorrentContentsIfEnabled: (
    hash: string,
  ) => Effect.Effect<
    QBitDisabledResult | { readonly _tag: "Found"; readonly files: readonly QBitTorrentFile[] },
    TorrentClientServiceError
  >;
  readonly listTorrentsIfEnabled: () => Effect.Effect<
    QBitDisabledResult | { readonly _tag: "Found"; readonly torrents: readonly QBitTorrent[] },
    TorrentClientServiceError
  >;
  readonly pauseTorrentIfEnabled: (
    hash: string,
  ) => Effect.Effect<QBitDisabledResult | { readonly _tag: "Paused" }, TorrentClientServiceError>;
  readonly resumeTorrentIfEnabled: (
    hash: string,
  ) => Effect.Effect<QBitDisabledResult | { readonly _tag: "Resumed" }, TorrentClientServiceError>;
}

export class TorrentClientService extends Effect.Service<TorrentClientService>()(
  "@bakarr/api/TorrentClientService",
  {
    effect: Effect.gen(function* () {
      const qbitClient = yield* QBitTorrentClient;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

      const resolveConfig = Effect.fn("TorrentClientService.resolveConfig")(function* () {
        const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
        const state = maybeQBitConfig(runtimeConfig);

        if (state._tag === "InvalidConfig") {
          return yield* new DomainInputError({
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
          const disabled: QBitDisabledResult = { _tag: "Disabled" };
          return disabled;
        }

        return yield* run(qbitConfig.config);
      });

      const addTorrentUrlIfEnabled = Effect.fn("TorrentClientService.addTorrentUrlIfEnabled")(
        function* (url: string) {
          return yield* withQBitConfig(
            (
              config,
            ): Effect.Effect<
              { readonly _tag: "Added" },
              ExternalCallError | QBitTorrentClientError
            > => qbitClient.addTorrentUrl(config, url).pipe(Effect.as({ _tag: "Added" })),
          );
        },
      );

      const listTorrentsIfEnabled = Effect.fn("TorrentClientService.listTorrentsIfEnabled")(
        function* () {
          return yield* withQBitConfig(
            (
              config,
            ): Effect.Effect<
              { readonly _tag: "Found"; readonly torrents: readonly QBitTorrent[] },
              ExternalCallError | QBitTorrentClientError
            > =>
              qbitClient.listTorrents(config).pipe(
                Effect.map((torrents) => ({
                  _tag: "Found",
                  torrents,
                })),
              ),
          );
        },
      );

      const listTorrentContentsIfEnabled = Effect.fn(
        "TorrentClientService.listTorrentContentsIfEnabled",
      )(function* (hash: string) {
        return yield* withQBitConfig(
          (
            config,
          ): Effect.Effect<
            { readonly _tag: "Found"; readonly files: readonly QBitTorrentFile[] },
            ExternalCallError | QBitTorrentClientError
          > =>
            qbitClient.listTorrentContents(config, hash).pipe(
              Effect.map((files) => ({
                _tag: "Found",
                files,
              })),
            ),
        );
      });

      const pauseTorrentIfEnabled = Effect.fn("TorrentClientService.pauseTorrentIfEnabled")(
        function* (hash: string) {
          return yield* withQBitConfig(
            (
              config,
            ): Effect.Effect<
              { readonly _tag: "Paused" },
              ExternalCallError | QBitTorrentClientError
            > => qbitClient.pauseTorrent(config, hash).pipe(Effect.as({ _tag: "Paused" })),
          );
        },
      );

      const resumeTorrentIfEnabled = Effect.fn("TorrentClientService.resumeTorrentIfEnabled")(
        function* (hash: string) {
          return yield* withQBitConfig(
            (
              config,
            ): Effect.Effect<
              { readonly _tag: "Resumed" },
              ExternalCallError | QBitTorrentClientError
            > => qbitClient.resumeTorrent(config, hash).pipe(Effect.as({ _tag: "Resumed" })),
          );
        },
      );

      const deleteTorrentIfEnabled = Effect.fn("TorrentClientService.deleteTorrentIfEnabled")(
        function* (hash: string, deleteFiles: boolean) {
          return yield* withQBitConfig(
            (
              config,
            ): Effect.Effect<
              { readonly _tag: "Deleted" },
              ExternalCallError | QBitTorrentClientError
            > =>
              qbitClient
                .deleteTorrent(config, hash, deleteFiles)
                .pipe(Effect.as({ _tag: "Deleted" })),
          );
        },
      );

      return {
        addTorrentUrlIfEnabled,
        deleteTorrentIfEnabled,
        listTorrentContentsIfEnabled,
        listTorrentsIfEnabled,
        pauseTorrentIfEnabled,
        resumeTorrentIfEnabled,
      } satisfies TorrentClientServiceShape;
    }),
  },
) {}

export const TorrentClientServiceLive = TorrentClientService.Default;

const maybeQBitConfig = (
  config: Config,
): TorrentClientConfigState | { readonly _tag: "InvalidConfig"; readonly reason: string } => {
  if (!config.qbittorrent.enabled) {
    return { _tag: "Disabled" };
  }

  if (!config.qbittorrent.password && config.qbittorrent.trusted_local !== true) {
    return {
      _tag: "InvalidConfig",
      reason: "qBittorrent is enabled but password is missing",
    };
  }

  return {
    _tag: "Enabled",
    config: new QBitConfigModel({
      baseUrl: config.qbittorrent.url,
      category: config.qbittorrent.default_category,
      password: Redacted.make(config.qbittorrent.password ?? ""),
      ratioLimit: config.qbittorrent.ratio_limit ?? undefined,
      savePath: config.qbittorrent.save_path || undefined,
      username: config.qbittorrent.username,
    }),
  };
};
