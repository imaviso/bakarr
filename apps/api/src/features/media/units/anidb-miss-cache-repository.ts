import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { anidbMissCache } from "@/db/schema.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";

export interface AniDbMissCacheRecord {
  readonly mediaId: number;
  readonly titleKey: string;
  readonly updatedAt: string;
}

export interface AniDbMissCacheRepositoryShape {
  readonly load: (
    mediaId: number,
  ) => Effect.Effect<Option.Option<AniDbMissCacheRecord>, DatabaseError>;
  readonly record: (input: {
    readonly mediaId: number;
    readonly titleKey: string;
    readonly updatedAt: string;
  }) => Effect.Effect<void, DatabaseError>;
  readonly clear: (mediaId: number) => Effect.Effect<void, DatabaseError>;
}

export class AniDbMissCacheRepository extends Context.Service<
  AniDbMissCacheRepository,
  AniDbMissCacheRepositoryShape
>()("@bakarr/api/AniDbMissCacheRepository") {
  static readonly layer = Layer.effect(
    AniDbMissCacheRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeAniDbMissCacheRepositoryShape(db, sqlClient);
    }),
  );
}

export function makeAniDbMissCacheRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): AniDbMissCacheRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    load: (mediaId) => loadAniDbMissCache(db, exec, mediaId),
    record: (input) => recordAniDbMissCache(db, exec, input),
    clear: (mediaId) => clearAniDbMissCache(db, exec, mediaId),
  };
}

const loadAniDbMissCache = Effect.fn("AniDbMissCacheRepository.load")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  const rows = yield* exec.runQuery(
    "Failed to load AniDB miss cache",
    db
      .select({
        mediaId: anidbMissCache.mediaId,
        titleKey: anidbMissCache.titleKey,
        updatedAt: anidbMissCache.updatedAt,
      })
      .from(anidbMissCache)
      .where(eq(anidbMissCache.mediaId, mediaId))
      .limit(1)
      .prepare()
      .effect(),
  );

  const row = rows[0];

  if (!row) {
    return Option.none<AniDbMissCacheRecord>();
  }

  return Option.some({
    mediaId: row.mediaId,
    titleKey: row.titleKey,
    updatedAt: row.updatedAt,
  } satisfies AniDbMissCacheRecord);
});

const recordAniDbMissCache = Effect.fn("AniDbMissCacheRepository.record")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly mediaId: number;
    readonly titleKey: string;
    readonly updatedAt: string;
  },
) {
  yield* exec.runQuery(
    "Failed to record AniDB miss cache",
    db
      .insert(anidbMissCache)
      .values({
        mediaId: input.mediaId,
        titleKey: input.titleKey,
        updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          titleKey: input.titleKey,
          updatedAt: input.updatedAt,
        },
        target: anidbMissCache.mediaId,
      })
      .prepare()
      .effect(),
  );
});

const clearAniDbMissCache = Effect.fn("AniDbMissCacheRepository.clear")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  yield* exec.runQuery(
    "Failed to clear AniDB miss cache",
    db.delete(anidbMissCache).where(eq(anidbMissCache.mediaId, mediaId)).prepare().effect(),
  );
});
