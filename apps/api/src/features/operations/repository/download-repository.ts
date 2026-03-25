import { and, inArray, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

import type {
  Download,
  DownloadEvent,
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
import { OperationsStoredDataError } from "../errors.ts";

const SQLITE_IN_LIST_CHUNK_SIZE = 900;
const CHUNK_LOAD_CONCURRENCY = 4;

type DownloadRow = typeof downloads.$inferSelect;
type DownloadEventRow = typeof downloadEvents.$inferSelect;

const DownloadSourceMetadataJsonSchema = Schema.parseJson(DownloadSourceMetadataSchema);
const DownloadEventMetadataJsonSchema = Schema.parseJson(DownloadEventMetadataSchema);

export const toDownload = Effect.fn("OperationsRepository.toDownload")(function* (
  row: DownloadRow,
  context?: DownloadPresentationContext,
) {
  const coveredEpisodes = yield* decodeCoveredEpisodes(row.coveredEpisodes);
  const coveragePending =
    Boolean(row.isBatch) && (!coveredEpisodes || coveredEpisodes.length === 0);
  const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);

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
  } satisfies Download;
});

export const toDownloadEvent = Effect.fn("OperationsRepository.toDownloadEvent")(function* (
  row: DownloadEventRow,
  context?: DownloadEventPresentationContext,
) {
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
    metadata_json: yield* decodeDownloadEventMetadata(row.metadata),
    torrent_name: context?.torrentName,
    to_status: row.toStatus ?? undefined,
  } satisfies DownloadEvent;
});

export const toDownloadStatus = Effect.fn("OperationsRepository.toDownloadStatus")(function* (
  row: DownloadRow,
  context?: DownloadPresentationContext,
) {
  const progress = row.progress ?? 0;
  const totalBytes = row.totalBytes ?? 0;
  const downloadedBytes = row.downloadedBytes ?? 0;
  const coveredEpisodes = yield* decodeCoveredEpisodes(row.coveredEpisodes);
  const coveragePending =
    Boolean(row.isBatch) && (!coveredEpisodes || coveredEpisodes.length === 0);
  const infoHash =
    row.infoHash ??
    (yield* new OperationsStoredDataError({
      message: "Stored download info hash is missing",
    }));
  const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);

  return {
    anime_id: row.animeId,
    anime_image: context?.animeImage,
    anime_title: row.animeTitle,
    coverage_pending: coveragePending || undefined,
    covered_episodes: coveredEpisodes,
    decision_reason: sourceMetadata?.decision_reason,
    downloaded_bytes: downloadedBytes,
    eta: row.etaSeconds ?? (row.status === "queued" ? 8640000 : 0),
    hash: infoHash,
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
  } satisfies DownloadStatus;
});

export function encodeDownloadSourceMetadata(value: DownloadSourceMetadata): string {
  return Schema.encodeSync(DownloadSourceMetadataJsonSchema)({
    ...value,
    seadex_tags: value.seadex_tags ? [...value.seadex_tags] : undefined,
  });
}

export const decodeDownloadSourceMetadata = Effect.fn(
  "OperationsRepository.decodeDownloadSourceMetadata",
)(function* (value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(DownloadSourceMetadataJsonSchema)(value).pipe(
    Effect.map((decoded) => cloneDownloadSourceMetadata(decoded)),
    Effect.mapError(
      () =>
        new OperationsStoredDataError({
          message: "Stored download source metadata is corrupt",
        }),
    ),
  );
});

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

export const decodeDownloadEventMetadata = Effect.fn(
  "OperationsRepository.decodeDownloadEventMetadata",
)(function* (value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(DownloadEventMetadataJsonSchema)(value).pipe(
    Effect.mapError(
      () =>
        new OperationsStoredDataError({
          message: "Stored download event metadata is corrupt",
        }),
    ),
  );
});

const decodeCoveredEpisodes = Effect.fn("OperationsRepository.decodeCoveredEpisodes")(function* (
  value: string | null | undefined,
) {
  if (!value) {
    return undefined;
  }

  return yield* Effect.try({
    try: () => decodeOptionalNumberList(value),
    catch: () =>
      new OperationsStoredDataError({
        message: "Stored covered episode metadata is corrupt",
      }),
  });
});

export const loadDownloadPresentationContexts = Effect.fn(
  "OperationsRepository.loadDownloadPresentationContexts",
)(function* (db: AppDatabase, rows: readonly DownloadRow[]) {
  if (rows.length === 0) {
    return new Map<number, DownloadPresentationContext>();
  }

  const animeIds = [...new Set(rows.map((row) => row.animeId))];
  const animeRows = yield* loadRowsByChunk(animeIds, (chunk) =>
    Effect.promise(() =>
      db
        .select({
          coverImage: anime.coverImage,
          id: anime.id,
        })
        .from(anime)
        .where(inArray(anime.id, chunk)),
    ),
  );
  const animeImageById = new Map(
    animeRows.map((row) => [row.id, row.coverImage ?? undefined] as const),
  );

  const importedRows = rows.filter((row) => row.status === "imported" || row.reconciledAt !== null);
  let episodeRows: Array<{
    animeId: number;
    filePath: string | null;
    number: number;
  }> = [];

  if (importedRows.length > 0) {
    episodeRows = yield* Effect.promise(() =>
      db
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
        ),
    );
  }
  const importedPathByEpisode = new Map(
    episodeRows.flatMap((row) =>
      row.filePath ? [[`${row.animeId}:${row.number}`, row.filePath] as const] : [],
    ),
  );

  const contexts = yield* Effect.forEach(rows, (row) =>
    Effect.gen(function* () {
      const coveredEpisodes = (yield* decodeCoveredEpisodes(row.coveredEpisodes)) ?? [];
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

  return new Map(contexts);
});

export const loadDownloadEventPresentationContexts = Effect.fn(
  "OperationsRepository.loadDownloadEventPresentationContexts",
)(function* (db: AppDatabase, rows: readonly DownloadEventRow[]) {
  if (rows.length === 0) {
    return new Map<number, DownloadEventPresentationContext>();
  }

  const animeIds = [
    ...new Set(rows.map((row) => row.animeId).filter((value): value is number => value !== null)),
  ];
  const downloadIds = [
    ...new Set(
      rows.map((row) => row.downloadId).filter((value): value is number => value !== null),
    ),
  ];

  const animeRows = yield* loadRowsByChunk(animeIds, (chunk) =>
    Effect.promise(() =>
      db
        .select({
          coverImage: anime.coverImage,
          id: anime.id,
          titleEnglish: anime.titleEnglish,
          titleRomaji: anime.titleRomaji,
        })
        .from(anime)
        .where(inArray(anime.id, chunk)),
    ),
  );
  const animeById = new Map(animeRows.map((row) => [row.id, row] as const));

  const downloadRows = yield* loadRowsByChunk(downloadIds, (chunk) =>
    Effect.promise(() =>
      db
        .select({
          id: downloads.id,
          torrentName: downloads.torrentName,
        })
        .from(downloads)
        .where(inArray(downloads.id, chunk)),
    ),
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
});

const loadRowsByChunk = Effect.fn("OperationsRepository.loadRowsByChunk")(
  <TId, TRow>(
    ids: readonly TId[],
    loadChunk: (chunk: readonly TId[]) => Effect.Effect<readonly TRow[]>,
  ) =>
    Effect.gen(function* () {
      if (ids.length === 0) {
        return [] as TRow[];
      }

      const chunks = chunkValues(ids, SQLITE_IN_LIST_CHUNK_SIZE);
      const chunkResults = yield* Effect.forEach(chunks, loadChunk, {
        concurrency: CHUNK_LOAD_CONCURRENCY,
      });

      return chunkResults.flatMap((chunk) => [...chunk]);
    }),
);

function chunkValues<T>(values: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push([...values.slice(index, index + size)]);
  }

  return chunks;
}
