import { inArray } from "drizzle-orm";
import { Effect, Schema } from "effect";

import type { DownloadEvent } from "../../../../packages/shared/src/index.ts";
import { DownloadEventMetadataSchema } from "../../../../packages/shared/src/index.ts";
import { anime, downloads } from "../db/schema.ts";
import type { AppDatabase, DatabaseError } from "../db/database.ts";
import { OperationsStoredDataError } from "../features/operations/errors.ts";
import { tryDatabasePromise } from "./effect-db.ts";

const DownloadEventMetadataJsonSchema = Schema.parseJson(DownloadEventMetadataSchema);

export interface DownloadEventPresentationContext {
  readonly animeImage?: string;
  readonly animeTitle?: string;
  readonly torrentName?: string;
}

export interface DownloadEventRowLike {
  readonly animeId: number | null;
  readonly createdAt: string;
  readonly downloadId: number | null;
  readonly eventType: string;
  readonly fromStatus: string | null;
  readonly id: number;
  readonly message: string;
  readonly metadata: string | null;
  readonly toStatus: string | null;
}

export const decodeDownloadEventMetadata = Effect.fn(
  "DownloadEventPresentations.decodeDownloadEventMetadata",
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

export const toDownloadEvent = Effect.fn("DownloadEventPresentations.toDownloadEvent")(
  function* (row: DownloadEventRowLike, context?: DownloadEventPresentationContext) {
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
  },
);

export const loadDownloadEventPresentationContexts = Effect.fn(
  "DownloadEventPresentations.loadDownloadEventPresentationContexts",
)(function* (db: AppDatabase, rows: readonly DownloadEventRowLike[]) {
  if (rows.length === 0) {
    return new Map<number, DownloadEventPresentationContext>();
  }

  const animeIds = [
    ...new Set(rows.map((row) => row.animeId).filter((value): value is number => value !== null)),
  ];
  const downloadIds = [
    ...new Set(rows.map((row) => row.downloadId).filter((value): value is number => value !== null)),
  ];

  const animeRows = yield* loadRowsByChunk(animeIds, (chunk) =>
    tryDatabasePromise("Failed to load download event presentation contexts", () =>
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
    tryDatabasePromise("Failed to load download event presentation contexts", () =>
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

const SQLITE_IN_LIST_CHUNK_SIZE = 900;
const CHUNK_LOAD_CONCURRENCY = 4;

const loadRowsByChunk = Effect.fn("DownloadEventPresentations.loadRowsByChunk")(
  <TId, TRow>(
    ids: readonly TId[],
    loadChunk: (chunk: readonly TId[]) => Effect.Effect<readonly TRow[], DatabaseError>,
  ): Effect.Effect<readonly TRow[], DatabaseError> =>
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
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
