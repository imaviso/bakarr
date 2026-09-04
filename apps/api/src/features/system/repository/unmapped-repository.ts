// oxlint-disable oxc/no-async-await -- async/await required by transaction callbacks, test callbacks, and tryPromise wrappers
import { eq, notInArray } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Context, Effect, Layer, Option, Schema } from "effect";

import {
  type UnmappedFolder,
  MediaSearchResultSchema,
  UnmappedFolderMatchStatusSchema,
  UnmappedFolderSchema,
} from "@packages/shared/index.ts";
import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { unmappedFolderMatches } from "@/db/schema.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import { buildUnmappedFolderSearchQueries } from "@/features/operations/unmapped/unmapped-folders.ts";
import { StoredUnmappedFolderCorruptError } from "@/features/system/errors.ts";

const MediaSearchResultListSchema = Schema.Array(MediaSearchResultSchema);

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

export class SystemUnmappedRepository extends Context.Service<
  SystemUnmappedRepository,
  SystemUnmappedRepositoryShape
>()("@bakarr/api/SystemUnmappedRepository") {
  static readonly layer = Layer.effect(
    SystemUnmappedRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeSystemUnmappedRepositoryShape(db, sqlClient);
    }),
  );
}

const encodeMediaSearchResultList = (path: string, matches: UnmappedFolder["suggested_matches"]) =>
  Schema.encodeEffect(Schema.fromJsonString(MediaSearchResultListSchema))(matches).pipe(
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
)(function* (db: AppDatabase, exec: DbExecutor) {
  return yield* exec.runQuery(
    "Failed to list unmapped folder matches",
    db.select().from(unmappedFolderMatches).orderBy(unmappedFolderMatches.path).prepare().effect(),
  );
});

export const deleteUnmappedFolderMatchRowsNotInPaths = Effect.fn(
  "SystemUnmappedRepository.deleteUnmappedFolderMatchRowsNotInPaths",
)(function* (db: AppDatabase, exec: DbExecutor, paths: readonly string[]) {
  if (paths.length === 0) {
    yield* exec.runQuery(
      "Failed to delete unmapped folder matches",
      db.delete(unmappedFolderMatches).prepare().effect(),
    );
    return;
  }

  yield* exec.runQuery(
    "Failed to delete unmapped folder matches",
    db
      .delete(unmappedFolderMatches)
      .where(notInArray(unmappedFolderMatches.path, [...paths]))
      .prepare()
      .effect(),
  );
});

export const upsertUnmappedFolderMatchRows = Effect.fn(
  "SystemUnmappedRepository.upsertUnmappedFolderMatchRows",
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  folders: readonly UnmappedFolder[],
  updatedAt: string,
) {
  if (folders.length === 0) {
    return;
  }

  const persistedFolders = yield* Effect.forEach(folders, (folder) =>
    encodeMediaSearchResultList(folder.path, folder.suggested_matches).pipe(
      Effect.map((suggestedMatches) => ({ folder, suggestedMatches })),
    ),
  );

  yield* exec.runTransaction(
    "Failed to upsert unmapped folder matches",
    Effect.gen(function* () {
      for (const { folder, suggestedMatches } of persistedFolders) {
        yield* db
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
          })
          .prepare()
          .effect();
      }
    }),
  );
});

export const loadUnmappedFolderMatchRow = Effect.fn(
  "SystemUnmappedRepository.loadUnmappedFolderMatchRow",
)(function* (db: AppDatabase, exec: DbExecutor, path: string) {
  const row = yield* exec.queryFirst(
    "Failed to load unmapped folder match",
    db
      .select()
      .from(unmappedFolderMatches)
      .where(eq(unmappedFolderMatches.path, path))
      .limit(1)
      .prepare()
      .effect(),
  );

  return Option.getOrUndefined(row);
});

export const decodeUnmappedFolderMatchRow = Effect.fn(
  "SystemUnmappedRepository.decodeUnmappedFolderMatchRow",
)(function* (row: typeof unmappedFolderMatches.$inferSelect) {
  const suggestedMatches = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(MediaSearchResultListSchema),
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
  const matchStatus = yield* Schema.decodeUnknownEffect(UnmappedFolderMatchStatusSchema)(
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

  return yield* Schema.decodeUnknownEffect(UnmappedFolderSchema)({
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

export function makeSystemUnmappedRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): SystemUnmappedRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    deleteMatchRowsNotInPaths: (paths) => deleteUnmappedFolderMatchRowsNotInPaths(db, exec, paths),
    listMatchRows: () => listUnmappedFolderMatchRows(db, exec),
    loadMatchRow: (path) => loadUnmappedFolderMatchRow(db, exec, path),
    upsertMatchRows: (folders, updatedAt) =>
      upsertUnmappedFolderMatchRows(db, exec, folders, updatedAt),
  } satisfies SystemUnmappedRepositoryShape;
}
