// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)

import { Effect, Redacted } from "effect";
import type { Config } from "@packages/shared/index.ts";
import {
  TorrentClientUnavailableError,
  type TorrentFile,
  type TorrentSnapshot,
} from "@/features/operations/torrent/torrent-domain.ts";
import type { TorrentClientAdapterShape } from "@/features/operations/torrent/torrent-adapter.ts";
import {
  mapQBitState,
  QBitTorrentClient,
  type QBitTorrent,
  type QBitTorrentFile,
} from "@/features/operations/qbittorrent/qbittorrent.ts";

import {
  type QBitConfig,
  QBitConfigModel,
  QBitTorrentClientError,
} from "@/features/operations/qbittorrent/qbittorrent-models.ts";

export function toTorrentSnapshot(torrent: QBitTorrent): TorrentSnapshot {
  return {
    contentPath: torrent.content_path ?? null,
    downloadedBytes: torrent.downloaded,
    eta: torrent.eta,
    hash: torrent.hash.toLowerCase(),
    name: torrent.name,
    progress: torrent.progress,
    rawState: torrent.state,
    savePath: torrent.save_path ?? null,
    size: torrent.size,
    speed: torrent.dlspeed,
    state: mapQBitState(torrent.state),
  };
}

function toTorrentFile(file: QBitTorrentFile): TorrentFile {
  return {
    name: file.name,
    progress: file.progress,
    size: file.size,
  };
}

export function makeQBitConfig(config: Config["qbittorrent"]): QBitConfig {
  return new QBitConfigModel({
    baseUrl: config.url,
    category: config.default_category,
    password: Redacted.make(config.password ?? ""),
    ratioLimit: config.ratio_limit ?? undefined,
    savePath: config.save_path || undefined,
    username: config.username,
  });
}

const toUnavailable = (cause: unknown) =>
  TorrentClientUnavailableError.make({
    cause,
    message: cause instanceof QBitTorrentClientError ? cause.message : "qBittorrent call failed",
  });

export function makeQBitTorrentAdapter(
  qbitClient: typeof QBitTorrentClient.Service,
  config: QBitConfig,
): TorrentClientAdapterShape {
  return {
    addTorrentUrl: (url) =>
      qbitClient.addTorrentUrl(config, url).pipe(Effect.mapError(toUnavailable)),
    deleteTorrent: (hash, deleteFiles) =>
      qbitClient.deleteTorrent(config, hash, deleteFiles).pipe(Effect.mapError(toUnavailable)),
    listTorrentContents: (hash) =>
      qbitClient.listTorrentContents(config, hash).pipe(
        Effect.map((files) => files.map(toTorrentFile)),
        Effect.mapError(toUnavailable),
      ),
    listTorrents: () =>
      qbitClient.listTorrents(config).pipe(
        Effect.map((torrents) => torrents.map(toTorrentSnapshot)),
        Effect.mapError(toUnavailable),
      ),
    pauseTorrent: (hash) =>
      qbitClient.pauseTorrent(config, hash).pipe(Effect.mapError(toUnavailable)),
    resumeTorrent: (hash) =>
      qbitClient.resumeTorrent(config, hash).pipe(Effect.mapError(toUnavailable)),
  };
}
