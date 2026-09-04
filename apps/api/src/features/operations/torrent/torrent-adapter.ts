import { Effect } from "effect";
import type {
  TorrentClientUnavailableError,
  TorrentFile,
  TorrentSnapshot,
} from "@/features/operations/torrent/torrent-domain.ts";

/**
 * Transport-level torrent client adapter. Config is baked into the adapter at
 * activation; callers never pass client credentials around. Normalized shape
 * shared by the qBittorrent and rTorrent adapters.
 */
export interface TorrentClientAdapterShape {
  readonly addTorrentUrl: (url: string) => Effect.Effect<void, TorrentClientUnavailableError>;
  readonly listTorrents: () => Effect.Effect<
    readonly TorrentSnapshot[],
    TorrentClientUnavailableError
  >;
  readonly listTorrentContents: (
    hash: string,
  ) => Effect.Effect<readonly TorrentFile[], TorrentClientUnavailableError>;
  readonly pauseTorrent: (hash: string) => Effect.Effect<void, TorrentClientUnavailableError>;
  readonly resumeTorrent: (hash: string) => Effect.Effect<void, TorrentClientUnavailableError>;
  readonly deleteTorrent: (
    hash: string,
    deleteFiles: boolean,
  ) => Effect.Effect<void, TorrentClientUnavailableError>;
}
