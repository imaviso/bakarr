import { and, eq, inArray, sql } from "drizzle-orm";
import { Schema } from "effect";

import type {
  Config,
  Download,
  DownloadEvent,
  DownloadSourceMetadata,
  DownloadStatus,
  PreferredTitle,
  QualityProfile,
  ReleaseProfileRule,
  RssFeed,
} from "../../../../../packages/shared/src/index.ts";
import {
  DownloadEventMetadataSchema,
  DownloadSourceMetadataSchema,
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

const SQLITE_IN_LIST_CHUNK_SIZE = 900;

export interface CurrentEpisodeState {
  readonly downloaded: boolean;
  readonly filePath?: string;
}

export interface NamingSettings {
  readonly namingFormat: string;
  readonly movieNamingFormat: string;
  readonly preferredTitle: PreferredTitle;
}

export interface DownloadPresentationContext {
  readonly animeImage?: string;
  readonly importedPath?: string;
}

export interface DownloadEventPresentationContext {
  readonly animeImage?: string;
  readonly animeTitle?: string;
  readonly torrentName?: string;
}

const DownloadSourceMetadataJsonSchema = Schema.parseJson(
  DownloadSourceMetadataSchema,
);
const DownloadEventMetadataJsonSchema = Schema.parseJson(
  DownloadEventMetadataSchema,
);

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

export function toDownload(
  row: typeof downloads.$inferSelect,
  context?: DownloadPresentationContext,
): Download {
  const coveredEpisodes = row.coveredEpisodes
    ? decodeOptionalNumberList(row.coveredEpisodes)
    : undefined;
  const coveragePending = Boolean(row.isBatch) &&
    (!coveredEpisodes || coveredEpisodes.length === 0);
  const sourceMetadata = decodeDownloadSourceMetadata(row.sourceMetadata);

  return {
    added_at: row.addedAt,
    anime_id: row.animeId,
    anime_image: context?.animeImage,
    anime_title: row.animeTitle,
    content_path: row.contentPath ?? undefined,
    coverage_pending: coveragePending || undefined,
    covered_episodes: coveredEpisodes,
    decision_reason: sourceMetadata?.decision_reason,
    download_date: row.downloadDate ?? undefined,
    downloaded_bytes: row.downloadedBytes ?? undefined,
    episode_number: row.episodeNumber,
    error_message: row.errorMessage ?? undefined,
    eta_seconds: row.etaSeconds ?? undefined,
    external_state: row.externalState ?? undefined,
    group_name: row.groupName ?? undefined,
    id: row.id,
    imported_path: context?.importedPath,
    is_batch: row.isBatch,
    last_error_at: row.lastErrorAt ?? undefined,
    last_synced_at: row.lastSyncedAt ?? undefined,
    progress: row.progress ?? undefined,
    reconciled_at: row.reconciledAt ?? undefined,
    retry_count: row.retryCount,
    save_path: row.savePath ?? undefined,
    speed_bytes: row.speedBytes ?? undefined,
    status: row.status,
    source_metadata: sourceMetadata,
    torrent_name: row.torrentName,
    total_bytes: row.totalBytes ?? undefined,
  };
}

export function toDownloadEvent(
  row: typeof downloadEvents.$inferSelect,
  context?: DownloadEventPresentationContext,
): DownloadEvent {
  return {
    anime_id: row.animeId ?? undefined,
    anime_image: context?.animeImage,
    anime_title: context?.animeTitle,
    created_at: row.createdAt,
    download_id: row.downloadId ?? undefined,
    event_type: row.eventType,
    from_status: row.fromStatus ?? undefined,
    id: row.id,
    message: row.message,
    metadata: row.metadata ?? undefined,
    metadata_json: decodeDownloadEventMetadata(row.metadata),
    torrent_name: context?.torrentName,
    to_status: row.toStatus ?? undefined,
  };
}

export function toDownloadStatus(
  row: typeof downloads.$inferSelect,
  randomHash: () => string,
  context?: DownloadPresentationContext,
): DownloadStatus {
  const progress = row.progress ?? 0;
  const totalBytes = row.totalBytes ?? 0;
  const downloadedBytes = row.downloadedBytes ?? 0;
  const coveredEpisodes = row.coveredEpisodes
    ? decodeOptionalNumberList(row.coveredEpisodes)
    : undefined;
  const coveragePending = Boolean(row.isBatch) &&
    (!coveredEpisodes || coveredEpisodes.length === 0);
  const sourceMetadata = decodeDownloadSourceMetadata(row.sourceMetadata);

  return {
    anime_id: row.animeId,
    anime_image: context?.animeImage,
    anime_title: row.animeTitle,
    coverage_pending: coveragePending || undefined,
    covered_episodes: coveredEpisodes,
    decision_reason: sourceMetadata?.decision_reason,
    downloaded_bytes: downloadedBytes,
    eta: row.etaSeconds ?? (row.status === "queued" ? 8640000 : 0),
    hash: row.infoHash ?? randomHash(),
    id: row.id,
    episode_number: row.episodeNumber,
    imported_path: context?.importedPath,
    is_batch: row.isBatch,
    name: row.torrentName,
    progress: Math.max(0, Math.min(progress / 100, 1)),
    speed: row.speedBytes ?? (row.status === "downloading" ? 1024 * 1024 : 0),
    source_metadata: sourceMetadata,
    state: row.status,
    total_bytes: totalBytes,
  };
}

export function encodeDownloadSourceMetadata(
  value: DownloadSourceMetadata,
): string {
  return Schema.encodeSync(DownloadSourceMetadataJsonSchema)({
    ...value,
    seadex_tags: value.seadex_tags ? [...value.seadex_tags] : undefined,
  });
}

export function decodeDownloadSourceMetadata(
  value: string | null | undefined,
): DownloadSourceMetadata | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const decoded = Schema.decodeUnknownSync(DownloadSourceMetadataJsonSchema)(
      value,
    );

    return cloneDownloadSourceMetadata(decoded);
  } catch {
    return undefined;
  }
}

export function encodeDownloadEventMetadata(value: {
  covered_episodes?: readonly number[];
  imported_path?: string;
  source_metadata?: DownloadSourceMetadata;
}): string {
  return Schema.encodeSync(DownloadEventMetadataJsonSchema)({
    covered_episodes: value.covered_episodes
      ? [...value.covered_episodes]
      : undefined,
    imported_path: value.imported_path,
    source_metadata: value.source_metadata,
  });
}

export function decodeDownloadEventMetadata(
  value: string | null | undefined,
): {
  covered_episodes?: number[];
  imported_path?: string;
  source_metadata?: DownloadSourceMetadata;
} | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return Schema.decodeUnknownSync(DownloadEventMetadataJsonSchema)(value);
  } catch {
    return undefined;
  }
}

function cloneDownloadSourceMetadata(
  value: DownloadSourceMetadata,
): DownloadSourceMetadata {
  return {
    ...value,
    ...(value.seadex_tags ? { seadex_tags: [...value.seadex_tags] } : {}),
    source_identity: value.source_identity
      ? cloneParsedEpisodeIdentity(value.source_identity)
      : undefined,
  };
}

function cloneParsedEpisodeIdentity(
  value: NonNullable<DownloadSourceMetadata["source_identity"]>,
): NonNullable<DownloadSourceMetadata["source_identity"]> {
  switch (value.scheme) {
    case "season":
      return {
        scheme: "season",
        season: value.season,
        episode_numbers: value.episode_numbers
          ? [...value.episode_numbers]
          : [],
        label: value.label,
      };
    case "absolute":
      return {
        scheme: "absolute",
        episode_numbers: value.episode_numbers
          ? [...value.episode_numbers]
          : [],
        label: value.label,
      };
    case "daily":
      return {
        scheme: "daily",
        air_dates: value.air_dates ? [...value.air_dates] : [],
        label: value.label,
      };
  }
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

export async function currentNamingSettings(
  db: AppDatabase,
): Promise<NamingSettings> {
  const rows = await db.select().from(appConfig).limit(1);
  const library = decodeStoredLibraryConfigOrThrow(rows[0]);

  return {
    movieNamingFormat: library.movie_naming_format,
    namingFormat: library.naming_format,
    preferredTitle: library.preferred_title,
  };
}

export async function loadDownloadPresentationContexts(
  db: AppDatabase,
  rows: readonly (typeof downloads.$inferSelect)[],
): Promise<Map<number, DownloadPresentationContext>> {
  if (rows.length === 0) {
    return new Map();
  }

  const animeIds = [...new Set(rows.map((row) => row.animeId))];
  const animeRows = await loadRowsByChunk(animeIds, (chunk) =>
    db.select({
      coverImage: anime.coverImage,
      id: anime.id,
    }).from(anime).where(inArray(anime.id, chunk)));
  const animeImageById = new Map(
    animeRows.map((row) => [row.id, row.coverImage ?? undefined] as const),
  );

  const importedRows = rows.filter((row) =>
    row.status === "imported" || row.reconciledAt !== null
  );
  const episodeRows = importedRows.length > 0
    ? await db.select({
      animeId: episodes.animeId,
      filePath: episodes.filePath,
      number: episodes.number,
    }).from(episodes).where(
      and(
        inArray(
          episodes.animeId,
          [...new Set(importedRows.map((row) => row.animeId))],
        ),
        sql`${episodes.filePath} is not null`,
      ),
    )
    : [];
  const importedPathByEpisode = new Map(
    episodeRows.flatMap((row) =>
      row.filePath
        ? [[`${row.animeId}:${row.number}`, row.filePath] as const]
        : []
    ),
  );

  return new Map(rows.map((row) => {
    const coveredEpisodes = row.coveredEpisodes
      ? decodeOptionalNumberList(row.coveredEpisodes)
      : [];
    const episodeNumbers = coveredEpisodes.length > 0
      ? coveredEpisodes
      : [row.episodeNumber];
    const importedPath = episodeNumbers.map((episodeNumber) =>
      importedPathByEpisode.get(`${row.animeId}:${episodeNumber}`)
    ).find((value): value is string =>
      typeof value === "string"
    ) ??
      (row.reconciledAt
        ? (row.contentPath ?? row.savePath ?? undefined)
        : undefined);

    return [row.id, {
      animeImage: animeImageById.get(row.animeId),
      importedPath,
    }] as const;
  }));
}

export async function loadDownloadEventPresentationContexts(
  db: AppDatabase,
  rows: readonly (typeof downloadEvents.$inferSelect)[],
): Promise<Map<number, DownloadEventPresentationContext>> {
  if (rows.length === 0) {
    return new Map();
  }

  const animeIds = [
    ...new Set(
      rows.map((row) => row.animeId).filter((value): value is number =>
        value !== null
      ),
    ),
  ];
  const downloadIds = [
    ...new Set(
      rows.map((row) => row.downloadId).filter((value): value is number =>
        value !== null
      ),
    ),
  ];

  const animeRows = await loadRowsByChunk(animeIds, (chunk) =>
    db.select({
      coverImage: anime.coverImage,
      id: anime.id,
      titleEnglish: anime.titleEnglish,
      titleRomaji: anime.titleRomaji,
    }).from(anime).where(inArray(anime.id, chunk)));
  const animeById = new Map(animeRows.map((row) => [row.id, row] as const));

  const downloadRows = await loadRowsByChunk(downloadIds, (chunk) =>
    db.select({
      id: downloads.id,
      torrentName: downloads.torrentName,
    }).from(downloads).where(inArray(downloads.id, chunk)));
  const downloadById = new Map(
    downloadRows.map((row) => [row.id, row] as const),
  );

  return new Map(rows.map((row) => {
    const animeRow = row.animeId !== null
      ? animeById.get(row.animeId)
      : undefined;
    const downloadRow = row.downloadId !== null
      ? downloadById.get(row.downloadId)
      : undefined;

    return [row.id, {
      animeImage: animeRow?.coverImage ?? undefined,
      animeTitle: animeRow?.titleEnglish ?? animeRow?.titleRomaji,
      torrentName: downloadRow?.torrentName ?? undefined,
    }] as const;
  }));
}

async function loadRowsByChunk<TId, TRow>(
  ids: readonly TId[],
  loadChunk: (chunk: readonly TId[]) => Promise<readonly TRow[]>,
): Promise<TRow[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await Promise.all(
    chunkValues(ids, SQLITE_IN_LIST_CHUNK_SIZE).map((chunk) =>
      loadChunk(chunk)
    ),
  );

  return rows.flatMap((chunk) => [...chunk]);
}

function chunkValues<T>(values: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push([...values.slice(index, index + size)]);
  }

  return chunks;
}
