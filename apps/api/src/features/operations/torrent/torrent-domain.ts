import { Schema } from "effect";

/**
 * Client-agnostic torrent domain shared by every torrent client adapter.
 *
 * Wire/UI never sees client-specific shapes; each adapter maps its native
 * snapshots into these types, so download sync/coverage/action services stay
 * identical across qBittorrent and rTorrent.
 */
export type TorrentState = "error" | "completed" | "paused" | "queued" | "downloading";

export interface TorrentSnapshot {
  /** BitTorrent info hash, lowercase hex. */
  readonly hash: string;
  readonly name: string;
  /** 0..1 */
  readonly progress: number;
  /** Download speed in bytes/s. */
  readonly speed: number;
  /** Seconds remaining, 0 = unknown/none. */
  readonly eta: number;
  readonly size: number;
  readonly downloadedBytes: number;
  readonly state: TorrentState;
  /** Raw client state string, preserved for logs. */
  readonly rawState: string;
  readonly savePath: string | null;
  /** Directory of the fully downloaded data, null while incomplete. */
  readonly contentPath: string | null;
}

export interface TorrentFile {
  /** Path relative to the torrent root, `/`-separated. */
  readonly name: string;
  readonly size: number;
  /** 0..1 */
  readonly progress: number;
}

export class TorrentClientUnavailableError extends Schema.TaggedError<TorrentClientUnavailableError>()(
  "TorrentClientUnavailableError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  },
) {}
