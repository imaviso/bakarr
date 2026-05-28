import { eq, notInArray } from "drizzle-orm";
import { Effect, Option, Schema } from "effect";

import {
  type UnmappedFolder,
  MediaSearchResultSchema,
  UnmappedFolderMatchStatusSchema,
  UnmappedFolderSchema,
} from "@packages/shared/index.ts";
import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { unmappedFolderMatches } from "@/db/schema.ts";
import { queryFirst, tryDatabasePromise } from "@/infra/effect/db.ts";
import { buildUnmappedFolderSearchQueries } from "@/features/operations/unmapped/unmapped-folders.ts";
import { StoredUnmappedFolderCorruptError } from "@/features/system/errors.ts";

const AnimeSearchResultListSchema = Schema.Array(MediaSearchResultSchema);

export interface SystemUnmappedRepositoryShape {
  readonly listMatchRows: () => ReturnType<typeof listUnmappedFolderMatchRows>;
  readonly deleteMatchRowsNotInPaths: (
    paths: readonly string[],
  ) => ReturnType<typeof deleteUnmappedFolderMatchRowsNotInPaths>;
  readonly upsertMatchRows: (
    folders: readonly UnmappedFolder[],
    updatedAt: string,
  ) => ReturnType<typeof upsertUnmappedFolderMatchRows>;
  readonly loadMatchRow: (path: string) => ReturnType<typeof loadUnmappedFolderMatchRow>;
}

export class SystemUnmappedRepository extends Effect.Service<SystemUnmappedRepository>()(
  "@bakarr/api/SystemUnmappedRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeSystemUnmappedRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

const encodeAnimeSearchResultList = (path: string, matches: UnmappedFolder["suggested_matches"]) =>
  Schema.encode(Schema.parseJson(AnimeSearchResultListSchema))(matches).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseError({
          cause,
          message: `Failed to encode unmapped folder suggestions for ${path}`,
        }),
    ),
  );

export const listUnmappedFolderMatchRows = Effect.fn(
  "SystemUnmappedRepository.listUnmappedFolderMatchRows",
)(function* (db: AppDatabase) {
  return yield* tryDatabasePromise("Failed to list unmapped folder matches", () =>
    db.select().from(unmappedFolderMatches).orderBy(unmappedFolderMatches.path),
  );
});

export const deleteUnmappedFolderMatchRowsNotInPaths = Effect.fn(
  "SystemUnmappedRepository.deleteUnmappedFolderMatchRowsNotInPaths",
)(function* (db: AppDatabase, paths: readonly string[]) {
  if (paths.length === 0) {
    yield* tryDatabasePromise("Failed to delete unmapped folder matches", () =>
      db.delete(unmappedFolderMatches),
    );
    return;
  }

  yield* tryDatabasePromise("Failed to delete unmapped folder matches", () =>
    db.delete(unmappedFolderMatches).where(notInArray(unmappedFolderMatches.path, [...paths])),
  );
});

export const upsertUnmappedFolderMatchRows = Effect.fn(
  "SystemUnmappedRepository.upsertUnmappedFolderMatchRows",
)(function* (db: AppDatabase, folders: readonly UnmappedFolder[], updatedAt: string) {
  if (folders.length === 0) {
    return;
  }

  const persistedFolders = yield* Effect.forEach(folders, (folder) =>
    encodeAnimeSearchResultList(folder.path, folder.suggested_matches).pipe(
      Effect.map((suggestedMatches) => ({ folder, suggestedMatches })),
    ),
  );

  yield* tryDatabasePromise("Failed to upsert unmapped folder matches", () =>
    db.transaction(async (tx) => {
      for (const { folder, suggestedMatches } of persistedFolders) {
        await tx
          .insert(unmappedFolderMatches)
          .values({
            matchAttempts: folder.match_attempts ?? 0,
            lastMatchedAt: folder.last_matched_at ?? null,
            lastMatchError: folder.last_match_error ?? null,
            matchStatus: folder.match_status ?? "pending",
            name: folder.name,
            path: folder.path,
            size: folder.size,
            suggestedMatches,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: unmappedFolderMatches.path,
            set: {
              matchAttempts: folder.match_attempts ?? 0,
              lastMatchedAt: folder.last_matched_at ?? null,
              lastMatchError: folder.last_match_error ?? null,
              matchStatus: folder.match_status ?? "pending",
              name: folder.name,
              size: folder.size,
              suggestedMatches,
              updatedAt,
            },
          });
      }
    }),
  );
});

export const loadUnmappedFolderMatchRow = Effect.fn(
  "SystemUnmappedRepository.loadUnmappedFolderMatchRow",
)(function* (db: AppDatabase, path: string) {
  const row = yield* queryFirst("Failed to load unmapped folder match", () =>
    db.select().from(unmappedFolderMatches).where(eq(unmappedFolderMatches.path, path)).limit(1),
  );

  return Option.getOrUndefined(row);
});

export const decodeUnmappedFolderMatchRow = Effect.fn(
  "SystemUnmappedRepository.decodeUnmappedFolderMatchRow",
)(function* (row: typeof unmappedFolderMatches.$inferSelect) {
  const suggestedMatches = yield* Schema.decodeUnknown(
    Schema.parseJson(AnimeSearchResultListSchema),
  )(row.suggestedMatches).pipe(
    Effect.mapError(
      (cause) =>
        new StoredUnmappedFolderCorruptError({
          cause,
          message: `Stored unmapped folder suggestions are corrupt for ${row.path}`,
        }),
    ),
    Effect.map((decoded) => [...decoded]),
  );
  const matchStatus = yield* Schema.decodeUnknown(UnmappedFolderMatchStatusSchema)(
    row.matchStatus,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new StoredUnmappedFolderCorruptError({
          cause,
          message: `Stored unmapped folder match status is corrupt for ${row.path}`,
        }),
    ),
  );

  return yield* Schema.decodeUnknown(UnmappedFolderSchema)({
    match_attempts: row.matchAttempts,
    last_match_error: row.lastMatchError ?? undefined,
    last_matched_at: row.lastMatchedAt ?? undefined,
    match_status: matchStatus,
    name: row.name,
    path: row.path,
    search_queries: buildUnmappedFolderSearchQueries(row.name),
    size: row.size,
    suggested_matches: suggestedMatches,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new StoredUnmappedFolderCorruptError({
          cause,
          message: `Stored unmapped folder row is corrupt for ${row.path}`,
        }),
    ),
  );
});

function makeSystemUnmappedRepositoryShape(db: AppDatabase): SystemUnmappedRepositoryShape {
  return {
    deleteMatchRowsNotInPaths: (paths) => deleteUnmappedFolderMatchRowsNotInPaths(db, paths),
    listMatchRows: () => listUnmappedFolderMatchRows(db),
    loadMatchRow: (path) => loadUnmappedFolderMatchRow(db, path),
    upsertMatchRows: (folders, updatedAt) => upsertUnmappedFolderMatchRows(db, folders, updatedAt),
  } satisfies SystemUnmappedRepositoryShape;
}

export function makeSystemUnmappedRepository(db: AppDatabase): SystemUnmappedRepository {
  return SystemUnmappedRepository.make(makeSystemUnmappedRepositoryShape(db));
}
