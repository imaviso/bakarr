import { and, inArray, sql } from "drizzle-orm";
import { Schema } from "effect";

import type {
  Download,
  DownloadEvent,
  DownloadEventMetadata,
  DownloadSourceMetadata,
  DownloadStatus,
} from "../../../../../../packages/shared/src/index.ts";
import {
  DownloadEventMetadataSchema,
  DownloadSourceMetadataSchema,
} from "../../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../../db/database.ts";
import { anime, downloadEvents, downloads, episodes } from "../../../db/schema.ts";
import { decodeOptionalNumberList } from "../../system/config-codec.ts";
import type { DownloadEventPresentationContext, DownloadPresentationContext } from "./types.ts";

const SQLITE_IN_LIST_CHUNK_SIZE = 900;
const CHUNK_LOAD_CONCURRENCY = 4;

type DownloadRow = typeof downloads.$inferSelect;
type DownloadEventRow = typeof downloadEvents.$inferSelect;

const DownloadSourceMetadataJsonSchema = Schema.parseJson(DownloadSourceMetadataSchema);
const DownloadEventMetadataJsonSchema = Schema.parseJson(DownloadEventMetadataSchema);

export function toDownload(row: DownloadRow, context?: DownloadPresentationContext): Download {
  const coveredEpisodes = row.coveredEpisodes
    ? decodeOptionalNumberList(row.coveredEpisodes)
    : undefined;
  const coveragePending =
    Boolean(row.isBatch) && (!coveredEpisodes || coveredEpisodes.length === 0);
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
  row: DownloadEventRow,
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
  row: DownloadRow,
  randomHash: () => string,
  context?: DownloadPresentationContext,
): DownloadStatus {
  const progress = row.progress ?? 0;
  const totalBytes = row.totalBytes ?? 0;
  const downloadedBytes = row.downloadedBytes ?? 0;
  const coveredEpisodes = row.coveredEpisodes
    ? decodeOptionalNumberList(row.coveredEpisodes)
    : undefined;
  const coveragePending =
    Boolean(row.isBatch) && (!coveredEpisodes || coveredEpisodes.length === 0);
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

export function encodeDownloadSourceMetadata(value: DownloadSourceMetadata): string {
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

  const decoded = Schema.decodeUnknownEither(DownloadSourceMetadataJsonSchema)(value);

  return decoded._tag === "Right" ? cloneDownloadSourceMetadata(decoded.right) : undefined;
}

function cloneDownloadSourceMetadata(value: DownloadSourceMetadata): DownloadSourceMetadata {
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
        episode_numbers: value.episode_numbers ? [...value.episode_numbers] : [],
        label: value.label,
      };
    case "absolute":
      return {
        scheme: "absolute",
        episode_numbers: value.episode_numbers ? [...value.episode_numbers] : [],
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

export function encodeDownloadEventMetadata(value: {
  covered_episodes?: readonly number[];
  imported_path?: string;
  source_metadata?: DownloadSourceMetadata;
}): string {
  return Schema.encodeSync(DownloadEventMetadataJsonSchema)({
    covered_episodes: value.covered_episodes ? [...value.covered_episodes] : undefined,
    imported_path: value.imported_path,
    source_metadata: value.source_metadata,
  });
}

export function decodeDownloadEventMetadata(
  value: string | null | undefined,
): DownloadEventMetadata | undefined {
  if (!value) {
    return undefined;
  }

  const decoded = Schema.decodeUnknownEither(DownloadEventMetadataJsonSchema)(value);

  return decoded._tag === "Right" ? decoded.right : undefined;
}

export async function loadDownloadPresentationContexts(
  db: AppDatabase,
  rows: readonly DownloadRow[],
): Promise<Map<number, DownloadPresentationContext>> {
  if (rows.length === 0) {
    return new Map();
  }

  const animeIds = [...new Set(rows.map((row) => row.animeId))];
  const animeRows = await loadRowsByChunk(animeIds, (chunk) =>
    db
      .select({
        coverImage: anime.coverImage,
        id: anime.id,
      })
      .from(anime)
      .where(inArray(anime.id, chunk)),
  );
  const animeImageById = new Map(
    animeRows.map((row) => [row.id, row.coverImage ?? undefined] as const),
  );

  const importedRows = rows.filter((row) => row.status === "imported" || row.reconciledAt !== null);
  const episodeRows =
    importedRows.length > 0
      ? await db
          .select({
            animeId: episodes.animeId,
            filePath: episodes.filePath,
            number: episodes.number,
          })
          .from(episodes)
          .where(
            and(
              inArray(episodes.animeId, [...new Set(importedRows.map((row) => row.animeId))]),
              sql`${episodes.filePath} is not null`,
            ),
          )
      : [];
  const importedPathByEpisode = new Map(
    episodeRows.flatMap((row) =>
      row.filePath ? [[`${row.animeId}:${row.number}`, row.filePath] as const] : [],
    ),
  );

  return new Map(
    rows.map((row) => {
      const coveredEpisodes = row.coveredEpisodes
        ? decodeOptionalNumberList(row.coveredEpisodes)
        : [];
      const episodeNumbers = coveredEpisodes.length > 0 ? coveredEpisodes : [row.episodeNumber];
      const importedPath =
        episodeNumbers
          .map((episodeNumber) => importedPathByEpisode.get(`${row.animeId}:${episodeNumber}`))
          .find((value): value is string => typeof value === "string") ??
        (row.reconciledAt ? (row.contentPath ?? row.savePath ?? undefined) : undefined);

      return [
        row.id,
        {
          animeImage: animeImageById.get(row.animeId),
          importedPath,
        },
      ] as const;
    }),
  );
}

export async function loadDownloadEventPresentationContexts(
  db: AppDatabase,
  rows: readonly DownloadEventRow[],
): Promise<Map<number, DownloadEventPresentationContext>> {
  if (rows.length === 0) {
    return new Map();
  }

  const animeIds = [
    ...new Set(rows.map((row) => row.animeId).filter((value): value is number => value !== null)),
  ];
  const downloadIds = [
    ...new Set(
      rows.map((row) => row.downloadId).filter((value): value is number => value !== null),
    ),
  ];

  const animeRows = await loadRowsByChunk(animeIds, (chunk) =>
    db
      .select({
        coverImage: anime.coverImage,
        id: anime.id,
        titleEnglish: anime.titleEnglish,
        titleRomaji: anime.titleRomaji,
      })
      .from(anime)
      .where(inArray(anime.id, chunk)),
  );
  const animeById = new Map(animeRows.map((row) => [row.id, row] as const));

  const downloadRows = await loadRowsByChunk(downloadIds, (chunk) =>
    db
      .select({
        id: downloads.id,
        torrentName: downloads.torrentName,
      })
      .from(downloads)
      .where(inArray(downloads.id, chunk)),
  );
  const downloadById = new Map(downloadRows.map((row) => [row.id, row] as const));

  return new Map(
    rows.map((row) => {
      const animeRow = row.animeId !== null ? animeById.get(row.animeId) : undefined;
      const downloadRow = row.downloadId !== null ? downloadById.get(row.downloadId) : undefined;

      return [
        row.id,
        {
          animeImage: animeRow?.coverImage ?? undefined,
          animeTitle: animeRow?.titleEnglish ?? animeRow?.titleRomaji,
          torrentName: downloadRow?.torrentName ?? undefined,
        },
      ] as const;
    }),
  );
}

async function loadRowsByChunk<TId, TRow>(
  ids: readonly TId[],
  loadChunk: (chunk: readonly TId[]) => Promise<readonly TRow[]>,
): Promise<TRow[]> {
  if (ids.length === 0) {
    return [];
  }

  const chunks = chunkValues(ids, SQLITE_IN_LIST_CHUNK_SIZE);
  const results: TRow[][] = [];

  for (let i = 0; i < chunks.length; i += CHUNK_LOAD_CONCURRENCY) {
    const batch = chunks.slice(i, i + CHUNK_LOAD_CONCURRENCY);
    const batchResults = await Promise.all(batch.map((chunk) => loadChunk(chunk)));
    for (const chunkResult of batchResults) {
      results.push([...chunkResult]);
    }
  }

  return results.flatMap((chunk) => chunk);
}

function chunkValues<T>(values: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push([...values.slice(index, index + size)]);
  }

  return chunks;
}
