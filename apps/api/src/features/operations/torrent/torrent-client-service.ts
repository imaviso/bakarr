import {
  TorrentClientUnavailableError,
  type TorrentFile,
  type TorrentSnapshot,
} from "@/features/operations/torrent/torrent-domain.ts";
import type { TorrentClientAdapterShape } from "@/features/operations/torrent/torrent-adapter.ts";
import {
  makeQBitConfig,
  makeQBitTorrentAdapter,
} from "@/features/operations/qbittorrent/qbittorrent-adapter.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent/qbittorrent.ts";
import { makeRtorrentClient } from "@/features/operations/rtorrent/rtorrent-client.ts";
import { makeTransportFromUrl } from "@/features/operations/rtorrent/scgi-transport.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";
import { DomainInputError } from "@/features/errors.ts";
import { Context, Effect, Layer } from "effect";

type TorrentClientServiceError =
  | TorrentClientUnavailableError
  | DomainInputError
  | RuntimeConfigSnapshotError;

export type TorrentDisabledResult = { readonly _tag: "Disabled" };

type EnabledSelection = { readonly _tag: "Enabled"; readonly client: TorrentClientAdapterShape };
type FoundTorrents = { readonly _tag: "Found"; readonly torrents: readonly TorrentSnapshot[] };
type FoundFiles = { readonly _tag: "Found"; readonly files: readonly TorrentFile[] };

const ADDED: { readonly _tag: "Added" } = { _tag: "Added" };
const DELETED: { readonly _tag: "Deleted" } = { _tag: "Deleted" };
const PAUSED: { readonly _tag: "Paused" } = { _tag: "Paused" };
const RESUMED: { readonly _tag: "Resumed" } = { _tag: "Resumed" };

export interface TorrentClientServiceShape {
  readonly addTorrentUrlIfEnabled: (
    url: string,
  ) => Effect.Effect<TorrentDisabledResult | { readonly _tag: "Added" }, TorrentClientServiceError>;
  readonly deleteTorrentIfEnabled: (
    hash: string,
    deleteFiles: boolean,
  ) => Effect.Effect<
    TorrentDisabledResult | { readonly _tag: "Deleted" },
    TorrentClientServiceError
  >;
  readonly listTorrentContentsIfEnabled: (
    hash: string,
  ) => Effect.Effect<
    TorrentDisabledResult | { readonly _tag: "Found"; readonly files: readonly TorrentFile[] },
    TorrentClientServiceError
  >;
  readonly listTorrentsIfEnabled: () => Effect.Effect<
    | TorrentDisabledResult
    | { readonly _tag: "Found"; readonly torrents: readonly TorrentSnapshot[] },
    TorrentClientServiceError
  >;
  readonly pauseTorrentIfEnabled: (
    hash: string,
  ) => Effect.Effect<
    TorrentDisabledResult | { readonly _tag: "Paused" },
    TorrentClientServiceError
  >;
  readonly resumeTorrentIfEnabled: (
    hash: string,
  ) => Effect.Effect<
    TorrentDisabledResult | { readonly _tag: "Resumed" },
    TorrentClientServiceError
  >;
}

/**
 * Client-agnostic torrent operations. Each call re-resolves the runtime config
 * (so settings changes apply without restart), builds the matching adapter,
 * and fails with TorrentClientUnavailableError when the selected backend is
 * unreachable. When no client is enabled every call returns Disabled and
 * callers skip their torrent work.
 */
export class TorrentClientService extends Context.Service<
  TorrentClientService,
  TorrentClientServiceShape
>()("@bakarr/api/TorrentClientService") {
  static readonly layer = Layer.effect(
    TorrentClientService,
    Effect.gen(function* () {
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
      const qbitClient = yield* QBitTorrentClient;

      const resolveClient = Effect.fn("TorrentClientService.resolveClient")(function* () {
        const config = yield* runtimeConfigSnapshot.getRuntimeConfig();

        if (config.qbittorrent.enabled) {
          const enabled: EnabledSelection = {
            _tag: "Enabled",
            client: makeQBitTorrentAdapter(qbitClient, makeQBitConfig(config.qbittorrent)),
          };
          return enabled;
        }

        if (config.rtorrent.enabled) {
          const transport = yield* makeTransportFromUrl(config.rtorrent.url);
          const client = yield* makeRtorrentClient(transport, {
            savePath: config.rtorrent.save_path ?? undefined,
          });
          const enabled: EnabledSelection = { _tag: "Enabled", client };
          return enabled;
        }

        const disabled: TorrentDisabledResult = { _tag: "Disabled" };
        return disabled;
      });

      const withClient = Effect.fn("TorrentClientService.withClient")(function* <A>(
        run: (client: TorrentClientAdapterShape) => Effect.Effect<A, TorrentClientUnavailableError>,
      ) {
        const selected = yield* resolveClient();

        if (selected._tag === "Disabled") {
          const disabled: TorrentDisabledResult = { _tag: "Disabled" };
          return disabled;
        }

        return yield* run(selected.client);
      });

      const addTorrentUrlIfEnabled = Effect.fn("TorrentClientService.addTorrentUrlIfEnabled")(
        function* (url: string) {
          return yield* withClient((client) => client.addTorrentUrl(url).pipe(Effect.as(ADDED)));
        },
      );

      const listTorrentsIfEnabled = Effect.fn("TorrentClientService.listTorrentsIfEnabled")(
        function* () {
          return yield* withClient((client) =>
            client
              .listTorrents()
              .pipe(Effect.map((torrents): FoundTorrents => ({ _tag: "Found", torrents }))),
          );
        },
      );

      const listTorrentContentsIfEnabled = Effect.fn(
        "TorrentClientService.listTorrentContentsIfEnabled",
      )(function* (hash: string) {
        return yield* withClient((client) =>
          client
            .listTorrentContents(hash)
            .pipe(Effect.map((files): FoundFiles => ({ _tag: "Found", files }))),
        );
      });

      const pauseTorrentIfEnabled = Effect.fn("TorrentClientService.pauseTorrentIfEnabled")(
        function* (hash: string) {
          return yield* withClient((client) => client.pauseTorrent(hash).pipe(Effect.as(PAUSED)));
        },
      );

      const resumeTorrentIfEnabled = Effect.fn("TorrentClientService.resumeTorrentIfEnabled")(
        function* (hash: string) {
          return yield* withClient((client) => client.resumeTorrent(hash).pipe(Effect.as(RESUMED)));
        },
      );

      const deleteTorrentIfEnabled = Effect.fn("TorrentClientService.deleteTorrentIfEnabled")(
        function* (hash: string, deleteFiles: boolean) {
          return yield* withClient((client) =>
            client.deleteTorrent(hash, deleteFiles).pipe(Effect.as(DELETED)),
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
  );
}

export const TorrentClientServiceLive = TorrentClientService.layer;
