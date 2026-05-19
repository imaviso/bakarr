import { and, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { media, downloads, mediaUnits } from "@/db/schema.ts";
import { decodeOptionalNumberList } from "@/features/profiles/profile-codec.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

const SQLITE_IN_LIST_CHUNK_SIZE = 900;
const CHUNK_LOAD_CONCURRENCY = 4;

type DownloadRow = typeof downloads.$inferSelect;

export const loadDownloadPresentationContexts = Effect.fn(
  "OperationsRepository.loadDownloadPresentationContexts",
)(function* (db: AppDatabase, rows: readonly DownloadRow[]) {
  if (rows.length === 0) {
    return new Map<number, DownloadPresentationContext>();
  }

  const animeIds = [...new Set(rows.map((row) => row.mediaId))];
  const importedMediaIds = [
    ...new Set(
      rows
        .filter((row) => row.status === "imported" || row.reconciledAt !== null)
        .map((row) => row.mediaId),
    ),
  ];
  const mediaUnitsJoinCondition =
    importedMediaIds.length > 0
      ? and(
          eq(mediaUnits.mediaId, media.id),
          inArray(mediaUnits.mediaId, importedMediaIds),
          sql`${mediaUnits.filePath} is not null`,
        )
      : sql`0 = 1`;

  const presentationRows = yield* loadRowsByChunk(animeIds, (chunk) =>
    tryDatabasePromise("Failed to load download presentation contexts", () =>
      db
        .select({
          coverImage: media.coverImage,
          filePath: mediaUnits.filePath,
          id: media.id,
          number: mediaUnits.number,
        })
        .from(media)
        .leftJoin(mediaUnits, mediaUnitsJoinCondition)
        .where(inArray(media.id, chunk)),
    ),
  );
  const animeImageById = new Map<number, string | undefined>();
  const importedPathByEpisode = new Map<string, string>();

  for (const row of presentationRows) {
    animeImageById.set(row.id, row.coverImage ?? undefined);

    if (row.filePath && row.number !== null) {
      importedPathByEpisode.set(`${row.id}:${row.number}`, row.filePath);
    }
  }

  const contexts = yield* Effect.forEach(rows, (row) =>
    Effect.gen(function* () {
      const coveredUnits = (yield* decodeCoveredEpisodes(row.coveredUnits)) ?? [];
      const unitNumbers = coveredUnits.length > 0 ? coveredUnits : [row.unitNumber];
      const rowCanShowImportedPath = row.status === "imported" || row.reconciledAt !== null;
      const importedPath = rowCanShowImportedPath
        ? (unitNumbers
            .map((unitNumber) => importedPathByEpisode.get(`${row.mediaId}:${unitNumber}`))
            .find((value): value is string => typeof value === "string") ??
          (row.reconciledAt ? (row.contentPath ?? row.savePath ?? undefined) : undefined))
        : undefined;

      return [
        row.id,
        {
          mediaImage: animeImageById.get(row.mediaId),
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

      return chunkResults.flatMap((chunk) => chunk);
    }),
);

const decodeCoveredEpisodes = Effect.fn("OperationsRepository.decodeCoveredEpisodes")(function* (
  value: string | null | undefined,
) {
  if (!value) {
    return undefined;
  }

  return yield* decodeOptionalNumberList(value).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsStoredDataError({
          cause,
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
