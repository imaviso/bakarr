import { and, eq } from "drizzle-orm";

import type {
  Config,
  Download,
  DownloadEvent,
  DownloadStatus,
  QualityProfile,
  ReleaseProfileRule,
  RssFeed,
} from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import {
  anime,
  appConfig,
  downloadEvents,
  downloads,
  episodes,
  qualityProfiles,
  releaseProfiles,
  rssFeeds,
} from "../../db/schema.ts";
import {
  decodeNumberListOrThrow,
  decodeOptionalNumberList,
  decodeQualityProfileRowOrThrow,
  decodeReleaseProfileRulesOrThrow,
  decodeStoredConfigRowOrThrow,
  decodeStoredLibraryConfigOrThrow,
} from "../system/config-codec.ts";
import { OperationsAnimeNotFoundError } from "./errors.ts";

export interface CurrentEpisodeState {
  readonly downloaded: boolean;
  readonly filePath?: string;
}

export async function requireAnime(db: AppDatabase, animeId: number) {
  const rows = await db.select().from(anime).where(eq(anime.id, animeId)).limit(
    1,
  );
  const row = rows[0];
  if (!row) {
    throw new OperationsAnimeNotFoundError({ message: "Anime not found" });
  }
  return row;
}

export function toRssFeed(row: typeof rssFeeds.$inferSelect): RssFeed {
  return {
    anime_id: row.animeId,
    created_at: row.createdAt,
    enabled: row.enabled,
    id: row.id,
    last_checked: row.lastChecked ?? undefined,
    name: row.name ?? undefined,
    url: row.url,
  };
}

export function toDownload(row: typeof downloads.$inferSelect): Download {
  const coveredEpisodes = row.coveredEpisodes
    ? decodeOptionalNumberList(row.coveredEpisodes)
    : undefined;
  const coveragePending = Boolean(row.isBatch) &&
    (!coveredEpisodes || coveredEpisodes.length === 0);

  return {
    added_at: row.addedAt,
    anime_id: row.animeId,
    anime_title: row.animeTitle,
    content_path: row.contentPath ?? undefined,
    coverage_pending: coveragePending || undefined,
    covered_episodes: coveredEpisodes,
    download_date: row.downloadDate ?? undefined,
    downloaded_bytes: row.downloadedBytes ?? undefined,
    episode_number: row.episodeNumber,
    error_message: row.errorMessage ?? undefined,
    eta_seconds: row.etaSeconds ?? undefined,
    external_state: row.externalState ?? undefined,
    group_name: row.groupName ?? undefined,
    id: row.id,
    is_batch: row.isBatch,
    last_error_at: row.lastErrorAt ?? undefined,
    last_synced_at: row.lastSyncedAt ?? undefined,
    progress: row.progress ?? undefined,
    reconciled_at: row.reconciledAt ?? undefined,
    retry_count: row.retryCount,
    save_path: row.savePath ?? undefined,
    speed_bytes: row.speedBytes ?? undefined,
    status: row.status,
    torrent_name: row.torrentName,
    total_bytes: row.totalBytes ?? undefined,
  };
}

export function toDownloadEvent(
  row: typeof downloadEvents.$inferSelect,
): DownloadEvent {
  return {
    anime_id: row.animeId ?? undefined,
    created_at: row.createdAt,
    download_id: row.downloadId ?? undefined,
    event_type: row.eventType,
    from_status: row.fromStatus ?? undefined,
    id: row.id,
    message: row.message,
    metadata: row.metadata ?? undefined,
    to_status: row.toStatus ?? undefined,
  };
}

export function toDownloadStatus(
  row: typeof downloads.$inferSelect,
  randomHash: () => string,
): DownloadStatus {
  const progress = row.progress ?? 0;
  const totalBytes = row.totalBytes ?? 0;
  const downloadedBytes = row.downloadedBytes ?? 0;
  const coveredEpisodes = row.coveredEpisodes
    ? decodeOptionalNumberList(row.coveredEpisodes)
    : undefined;
  const coveragePending = Boolean(row.isBatch) &&
    (!coveredEpisodes || coveredEpisodes.length === 0);

  return {
    coverage_pending: coveragePending || undefined,
    covered_episodes: coveredEpisodes,
    downloaded_bytes: downloadedBytes,
    eta: row.etaSeconds ?? (row.status === "queued" ? 8640000 : 0),
    hash: row.infoHash ?? randomHash(),
    id: row.id,
    episode_number: row.episodeNumber,
    is_batch: row.isBatch,
    name: row.torrentName,
    progress: Math.max(0, Math.min(progress / 100, 1)),
    speed: row.speedBytes ?? (row.status === "downloading" ? 1024 * 1024 : 0),
    state: row.status,
    total_bytes: totalBytes,
  };
}

export async function loadRuntimeConfig(db: AppDatabase): Promise<Config> {
  const rows = await db.select().from(appConfig).limit(1);
  const core = decodeStoredConfigRowOrThrow(rows[0]);
  const profileRows = await db.select().from(qualityProfiles);

  return {
    ...core,
    profiles: profileRows.map(decodeQualityProfileRowOrThrow),
  };
}

export async function loadQualityProfile(
  db: AppDatabase,
  name: string,
): Promise<QualityProfile | null> {
  const rows = await db.select().from(qualityProfiles).where(
    eq(qualityProfiles.name, name),
  ).limit(1);

  if (!rows[0]) {
    return null;
  }

  return decodeQualityProfileRowOrThrow(rows[0]);
}

export async function loadReleaseRules(
  db: AppDatabase,
  animeRow: typeof anime.$inferSelect,
): Promise<readonly ReleaseProfileRule[]> {
  const assignedIds = decodeNumberListOrThrow(animeRow.releaseProfileIds);
  const rows = await db.select().from(releaseProfiles);
  return rows
    .filter((row) =>
      row.enabled && (row.isGlobal || assignedIds.includes(row.id))
    )
    .flatMap((row) => decodeReleaseProfileRulesOrThrow(row.rules));
}

export async function loadCurrentEpisodeState(
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
): Promise<CurrentEpisodeState | null> {
  const rows = await db.select().from(episodes).where(
    and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)),
  ).limit(1);

  if (!rows[0]) {
    return null;
  }

  return {
    downloaded: rows[0].downloaded,
    filePath: rows[0].filePath ?? undefined,
  };
}

export async function getConfigLibraryPath(db: AppDatabase) {
  const rows = await db.select().from(appConfig).limit(1);

  return decodeStoredLibraryConfigOrThrow(rows[0]).library_path;
}

export async function currentImportMode(db: AppDatabase) {
  const rows = await db.select().from(appConfig).limit(1);

  return decodeStoredLibraryConfigOrThrow(rows[0]).import_mode;
}

export async function currentNamingFormat(db: AppDatabase) {
  const rows = await db.select().from(appConfig).limit(1);

  return decodeStoredLibraryConfigOrThrow(rows[0]).naming_format;
}
