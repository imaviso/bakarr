import { and, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { anime, downloads, episodes } from "@/db/schema.ts";
import { effectDecodeOptionalNumberList } from "@/features/system/config-codec.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

const SQLITE_IN_LIST_CHUNK_SIZE = 900;
const CHUNK_LOAD_CONCURRENCY = 4;

type DownloadRow = typeof downloads.$inferSelect;

export const loadDownloadPresentationContexts = Effect.fn(
  "OperationsRepository.loadDownloadPresentationContexts",
)(function* (db: AppDatabase, rows: readonly DownloadRow[]) {
  if (rows.length === 0) {
    return new Map<number, DownloadPresentationContext>();
  }

  const animeIds = [...new Set(rows.map((row) => row.animeId))];
  const animeRows = yield* loadRowsByChunk(animeIds, (chunk) =>
    tryDatabasePromise("Failed to load download presentation contexts", () =>
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
    episodeRows = yield* tryDatabasePromise("Failed to load download presentation contexts", () =>
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

const loadRowsByChunk = Effect.fn("OperationsRepository.loadRowsByChunk")(
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

const decodeCoveredEpisodes = Effect.fn("OperationsRepository.decodeCoveredEpisodes")(function* (
  value: string | null | undefined,
) {
  if (!value) {
    return undefined;
  }

  return yield* effectDecodeOptionalNumberList(value).pipe(
    Effect.mapError(
      () =>
        new OperationsStoredDataError({
          message: "Stored covered episode metadata is corrupt",
        }),
    ),
  );
});

function chunkValues<T>(values: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
