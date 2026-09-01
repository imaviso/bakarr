// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Effect } from "effect";

import {
  TorrentClientUnavailableError,
  type TorrentFile,
  type TorrentSnapshot,
  type TorrentState,
} from "@/features/operations/torrent/torrent-domain.ts";
import {
  encodeScgiRequest,
  splitScgiResponse,
  type ScgiTransportShape,
} from "@/features/operations/rtorrent/scgi-transport.ts";
import {
  decodeXmlRpcResponse,
  encodeXmlRpcCall,
  expectArray,
  expectString,
  str,
  type XmlRpcValue,
} from "@/features/operations/rtorrent/xmlrpc.ts";

/**
 * rTorrent call keys requested per torrent in `d.multicall2`. Field selection
 * is explicit so future fields are opt-in, not accidental wire drift.
 */
const TORRENT_CALL_KEYS: readonly string[] = [
  "d.hash=",
  "d.name=",
  "d.completed_bytes=",
  "d.size_bytes=",
  "d.down.rate=",
  "d.state=",
  "d.complete=",
  "d.paused=",
  "d.message=",
  "d.base_path=",
  "d.directory=",
];

const FILE_CALL_KEYS: readonly string[] = [
  "f.path=",
  "f.size_bytes=",
  "f.completed_chunks=",
  "f.size_chunks=",
];

// Row indexes into TORRENT_CALL_KEYS responses.
const IDX_MESSAGE = 8;
const IDX_BASE_PATH = 9;
const IDX_DIRECTORY = 10;

const callError = (cause: unknown, message: string) =>
  TorrentClientUnavailableError.make({ cause, message });

const firstString = (...values: readonly (XmlRpcValue | undefined)[]): string | null => {
  for (const value of values) {
    if (value?.stringValue !== undefined) return value.stringValue;
  }
  return null;
};

function mapRtorrentState(
  state: number,
  complete: number,
  paused: number,
  message: string,
): TorrentState {
  if (message.length > 0 && message.toLowerCase().includes("error")) {
    return "error";
  }

  if (complete === 1) {
    return "completed";
  }

  if (paused === 1) return "paused";
  if (state === 1) return "downloading";
  return "queued";
}

function describeRawState(state: number, complete: number, paused: number): string {
  if (paused === 1) return complete === 1 ? "paused-seeding" : "paused";
  if (complete === 1) return "seeding";
  if (state === 1) return "downloading";
  return "stopped";
}

function toTorrentSnapshot(row: readonly XmlRpcValue[]): TorrentSnapshot {
  const hash = expectString(row[0] ?? str(""));
  const name = expectString(row[1] ?? str(""));
  const completedBytes = row[2]?.intValue ?? 0;
  const sizeBytes = row[3]?.intValue ?? 0;
  const downRate = row[4]?.intValue ?? 0;
  const state = row[5]?.intValue ?? 0;
  const complete = row[6]?.intValue ?? 0;
  const paused = row[7]?.intValue ?? 0;
  const message = row[IDX_MESSAGE] ? expectString(row[IDX_MESSAGE]) : "";
  const completePaths = complete === 1 ? [row[IDX_BASE_PATH], row[IDX_DIRECTORY]] : [];

  return {
    contentPath: completePaths.length > 0 ? firstString(...completePaths) : null,
    downloadedBytes: completedBytes,
    eta: 0,
    hash: hash.toLowerCase(),
    name,
    progress: sizeBytes > 0 ? Math.min(1, completedBytes / sizeBytes) : 0,
    rawState: message.length > 0 ? message : describeRawState(state, complete, paused),
    savePath: firstString(row[IDX_DIRECTORY], row[IDX_BASE_PATH]),
    size: sizeBytes,
    speed: downRate,
    state: mapRtorrentState(state, complete, paused, message),
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
      const body = encodeXmlRpcCall(methodName, params);
      const encoded = encodeScgiRequest(
        {
          CONTENT_LENGTH: String(body.length),
          SCGI: "1",
        },
        body,
      );

      const raw = yield* transport.request(encoded);

      return yield* decodeXmlRpcResponse(splitScgiResponse(raw)).pipe(
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
      const rows = yield* multicall("rtorrent.listTorrents", "d.multicall2", [
        str(""),
        str("main"),
        ...TORRENT_CALL_KEYS.map(str),
      ]);
      return rows.map(toTorrentSnapshot);
    });

    const listTorrentContents = Effect.fn("RtorrentClient.listTorrentContents")(function* (
      hash: string,
    ) {
      const rows = yield* multicall("rtorrent.listTorrentContents", "f.multicall", [
        str(`${hash}:`),
        ...FILE_CALL_KEYS.map(str),
      ]);
      return rows.map(toTorrentFile);
    });

    const addTorrentUrl = Effect.fn("RtorrentClient.addTorrentUrl")(function* (url: string) {
      yield* call("rtorrent.addTorrentUrl", "load.start", [str(""), str(url)]);
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
