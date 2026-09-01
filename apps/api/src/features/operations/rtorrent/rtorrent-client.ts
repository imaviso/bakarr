// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Effect } from "effect";

import {
  TorrentClientUnavailableError,
  type TorrentFile,
  type TorrentSnapshot,
  type TorrentState,
} from "@/features/operations/torrent/torrent-domain.ts";
import type { ScgiTransportShape } from "@/features/operations/rtorrent/scgi-transport.ts";
import {
  decodeXmlRpcResponse,
  encodeXmlRpcCall,
  expectArray,
  expectString,
  str,
  type XmlRpcValue,
} from "@/features/operations/rtorrent/xmlrpc.ts";

/**
 * rTorrent call keys requested per torrent in `d.multicall2`. Mirrors the
 * field set Sonarr relies on (d.is_open/d.is_active/d.complete/d.left_bytes),
 * which works across rTorrent 0.9.x through 0.15.x. `d.paused` is avoided
 * because it only exists on newer releases and faults the whole multicall on
 * older ones.
 */
const TORRENT_CALL_KEYS: readonly string[] = [
  "d.name=",
  "d.hash=",
  "d.base_path=",
  "d.size_bytes=",
  "d.left_bytes=",
  "d.down.rate=",
  "d.is_open=",
  "d.is_active=",
  "d.complete=",
  "d.message=",
  "d.directory=",
];

// Row indexes into TORRENT_CALL_KEYS responses.
const IDX_NAME = 0;
const IDX_HASH = 1;
const IDX_BASE_PATH = 2;
const IDX_SIZE = 3;
const IDX_LEFT = 4;
const IDX_RATE = 5;
const IDX_IS_OPEN = 6;
const IDX_IS_ACTIVE = 7;
const IDX_COMPLETE = 8;
const IDX_MESSAGE = 9;
const IDX_DIRECTORY = 10;

const FILE_CALL_KEYS: readonly string[] = [
  "f.path=",
  "f.size_bytes=",
  "f.completed_chunks=",
  "f.size_chunks=",
];

// Sonarr's magnet-resolution budget: 10 tries x 500ms.
const MAGNET_WAIT_TRIES = 10;
const MAGNET_WAIT_DELAY = "500 millis";

const MAGNET_HASH_PATTERN = /urn:btih:([0-9a-fA-F]{40}|[A-Za-z2-7]{32})/;

const callError = (cause: unknown, message: string) =>
  TorrentClientUnavailableError.make({ cause, message });

const firstString = (...values: readonly (XmlRpcValue | undefined)[]): string | null => {
  for (const value of values) {
    if (value?.stringValue !== undefined) return value.stringValue;
  }
  return null;
};

function mapRtorrentState(
  complete: number,
  isOpen: number,
  isActive: number,
  message: string,
): TorrentState {
  if (message.length > 0 && message.toLowerCase().includes("error")) {
    return "error";
  }

  // Sonarr's mapping: finished -> completed, active -> downloading, else paused.
  if (complete === 1) return "completed";
  if (isOpen === 1 && isActive === 1) return "downloading";
  return "paused";
}

function describeRawState(complete: number, isOpen: number, isActive: number): string {
  if (complete === 1) return "seeding";
  if (isOpen !== 1) return "stopped";
  return isActive === 1 ? "downloading" : "idle";
}

function toTorrentSnapshot(row: readonly XmlRpcValue[]): TorrentSnapshot {
  const name = expectString(row[IDX_NAME] ?? str(""));
  const hash = expectString(row[IDX_HASH] ?? str(""));
  const sizeBytes = row[IDX_SIZE]?.intValue ?? 0;
  const leftBytes = Math.min(row[IDX_LEFT]?.intValue ?? 0, sizeBytes);
  const downRate = row[IDX_RATE]?.intValue ?? 0;
  const isOpen = row[IDX_IS_OPEN]?.intValue ?? 0;
  const isActive = row[IDX_IS_ACTIVE]?.intValue ?? 0;
  const complete = row[IDX_COMPLETE]?.intValue ?? 0;
  const message = row[IDX_MESSAGE] ? expectString(row[IDX_MESSAGE]) : "";
  const downloadedBytes = Math.max(0, sizeBytes - leftBytes);

  return {
    contentPath: complete === 1 ? firstString(row[IDX_BASE_PATH], row[IDX_DIRECTORY]) : null,
    downloadedBytes,
    eta: downRate > 0 && leftBytes > 0 ? Math.ceil(leftBytes / downRate) : 0,
    hash: hash.toLowerCase(),
    name,
    progress: sizeBytes > 0 ? Math.min(1, Math.max(0, downloadedBytes / sizeBytes)) : 0,
    rawState: message.length > 0 ? message : describeRawState(complete, isOpen, isActive),
    savePath: firstString(row[IDX_DIRECTORY], row[IDX_BASE_PATH]),
    size: sizeBytes,
    speed: downRate,
    state: mapRtorrentState(complete, isOpen, isActive, message),
  };
}

function toTorrentFile(row: readonly XmlRpcValue[]): TorrentFile {
  const path = expectString(row[0] ?? str(""));
  const sizeBytes = row[1]?.intValue ?? 0;
  const completedChunks = row[2]?.intValue ?? 0;
  const sizeChunks = Math.max(1, row[3]?.intValue ?? 1);
  return {
    name: path,
    progress: completedChunks / sizeChunks,
    size: sizeBytes,
  };
}

export interface RtorrentClientShape {
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

export const makeRtorrentClient = (
  transport: ScgiTransportShape,
): Effect.Effect<RtorrentClientShape> =>
  Effect.sync(() => {
    const call = Effect.fn("RtorrentClient.call")(function* (
      operation: string,
      methodName: string,
      params: readonly XmlRpcValue[],
    ) {
      const raw = yield* transport.request(encodeXmlRpcCall(methodName, params));

      return yield* decodeXmlRpcResponse(raw).pipe(
        Effect.mapError((error) => callError(error.cause, `${error.message} (${operation})`)),
      );
    });

    const multicall = Effect.fn("RtorrentClient.multicall")(function* (
      operation: string,
      methodName: string,
      params: readonly XmlRpcValue[],
    ) {
      const result = yield* call(operation, methodName, params);
      return expectArray(result).map(expectArray);
    });

    const listTorrents = Effect.fn("RtorrentClient.listTorrents")(function* () {
      // Empty view = all downloads in every view (Sonarr's exact call shape).
      const rows = yield* multicall("rtorrent.listTorrents", "d.multicall2", [
        str(""),
        str(""),
        ...TORRENT_CALL_KEYS.map(str),
      ]);
      return rows.map(toTorrentSnapshot);
    });

    const listTorrentContents = Effect.fn("RtorrentClient.listTorrentContents")(function* (
      hash: string,
    ) {
      const rows = yield* multicall("rtorrent.listTorrentContents", "f.multicall", [
        str(hash),
        ...FILE_CALL_KEYS.map(str),
      ]);
      return rows.map(toTorrentFile);
    });

    // Sonarr's HasHashTorrent: d.name on the hash, ignoring magnet meta
    // placeholders ("<hash>.meta") and RPC faults for unknown hashes.
    const hasHashTorrent = Effect.fn("RtorrentClient.hasHashTorrent")(function* (hash: string) {
      const reply = yield* call("rtorrent.hasHashTorrent", "d.name", [str(hash)]).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
      );

      if (reply === null || reply.kind === "array" || reply.kind === "struct") return false;
      const name = expectString(reply);
      return name.length > 0 && name !== `${hash}.meta`;
    });

    const waitForTorrent = Effect.fn("RtorrentClient.waitForTorrent")(function* (hash: string) {
      for (let attempt = 0; attempt < MAGNET_WAIT_TRIES; attempt += 1) {
        if (yield* hasHashTorrent(hash)) return true;
        yield* Effect.sleep(MAGNET_WAIT_DELAY);
      }
      return false;
    });

    const addTorrentUrl = Effect.fn("RtorrentClient.addTorrentUrl")(function* (url: string) {
      // load.start returns 0 on success; anything else is an add failure
      // (Sonarr throws on non-zero too).
      const reply = yield* call("rtorrent.addTorrentUrl", "load.start", [str(""), str(url)]);

      if ((reply.intValue ?? 0) !== 0) {
        yield* Effect.fail(
          callError(
            undefined,
            `rTorrent could not add torrent (load.start returned ${reply.intValue})`,
          ),
        );
        return;
      }

      // Magnets resolve asynchronously; wait for the info hash to register so
      // callers observe the torrent immediately instead of a missing download.
      const magnetHash = MAGNET_HASH_PATTERN.exec(url)?.[1];
      if (magnetHash) {
        const hash = magnetHash.toLowerCase();
        const found = yield* waitForTorrent(hash);
        if (!found) {
          yield* Effect.logWarning(
            "rTorrent did not resolve the magnet within the wait budget; download may appear late",
          ).pipe(Effect.annotateLogs({ hash, url }));
        }
      }
    });

    const pauseTorrent = Effect.fn("RtorrentClient.pauseTorrent")(function* (hash: string) {
      yield* call("rtorrent.pauseTorrent", "d.pause", [str(hash)]);
    });

    const resumeTorrent = Effect.fn("RtorrentClient.resumeTorrent")(function* (hash: string) {
      yield* call("rtorrent.resumeTorrent", "d.resume", [str(hash)]);
    });

    const deleteTorrent = Effect.fn("RtorrentClient.deleteTorrent")(function* (
      hash: string,
      deleteFiles: boolean,
    ) {
      yield* call("rtorrent.deleteTorrent", "d.erase", [str(hash)]);
      if (deleteFiles) {
        // rTorrent exposes no remote file deletion over RPC; data removal is the
        // operator's job (or the local downloads cleanup handles visible files).
        yield* Effect.logDebug(
          "rTorrent does not support remote file deletion; download data left in place",
        ).pipe(Effect.annotateLogs({ hash }));
      }
    });

    return {
      addTorrentUrl,
      deleteTorrent,
      listTorrentContents,
      listTorrents,
      pauseTorrent,
      resumeTorrent,
    } satisfies RtorrentClientShape;
  });
