import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { anidbEpisodeCache } from "@/db/schema.ts";
import {
  AnimeMetadataEpisodeSchema,
  type AnimeMetadataEpisode,
} from "@/features/media/metadata/anilist-model.ts";
import { StoredDataError } from "@/features/errors.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";

const AniDbEpisodeCachePayloadJsonSchema = Schema.fromJsonString(
  Schema.Array(AnimeMetadataEpisodeSchema),
);

const decodeAniDbEpisodeCachePayload = Schema.decodeUnknownEffect(
  AniDbEpisodeCachePayloadJsonSchema,
);
const encodeAniDbEpisodeCachePayload = Schema.encodeEffect(AniDbEpisodeCachePayloadJsonSchema);

export interface AniDbEpisodeCacheRecord {
  readonly mediaId: number;
  readonly mediaUnits: ReadonlyArray<AnimeMetadataEpisode>;
  readonly updatedAt: string;
}

export interface AniDbUnitCacheRepositoryShape {
  readonly load: (
    mediaId: number,
  ) => Effect.Effect<Option.Option<AniDbEpisodeCacheRecord>, DatabaseError | StoredDataError>;
  readonly upsert: (input: {
    readonly mediaId: number;
    readonly mediaUnits: ReadonlyArray<AnimeMetadataEpisode>;
    readonly updatedAt: string;
  }) => Effect.Effect<void, DatabaseError | StoredDataError>;
}

export class AniDbUnitCacheRepository extends Context.Service<
  AniDbUnitCacheRepository,
  AniDbUnitCacheRepositoryShape
>()("@bakarr/api/AniDbUnitCacheRepository") {
  static readonly layer = Layer.effect(
    AniDbUnitCacheRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeAniDbUnitCacheRepositoryShape(db, sqlClient);
    }),
  );
}

export function makeAniDbUnitCacheRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): AniDbUnitCacheRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    load: (mediaId) => loadAniDbEpisodeCache(db, exec, mediaId),
    upsert: (input) => upsertAniDbEpisodeCache(db, exec, input),
  };
}

const loadAniDbEpisodeCache = Effect.fn("AniDbUnitCacheRepository.load")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  const rows = yield* exec.runQuery(
    "Failed to load AniDB episode cache",
    db
      .select({
        mediaId: anidbEpisodeCache.mediaId,
        mediaUnits: anidbEpisodeCache.mediaUnits,
        updatedAt: anidbEpisodeCache.updatedAt,
      })
      .from(anidbEpisodeCache)
      .where(eq(anidbEpisodeCache.mediaId, mediaId))
      .limit(1)
      .prepare()
      .effect(),
  );

  const row = rows[0];

  if (!row) {
    return Option.none<AniDbEpisodeCacheRecord>();
  }

  const decodedEpisodes = yield* decodeAniDbEpisodeCachePayload(row.mediaUnits).pipe(
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "AniDB episode cache is corrupt",
        }),
    ),
  );

  return Option.some({
    mediaId: row.mediaId,
    mediaUnits: decodedEpisodes,
    updatedAt: row.updatedAt,
  } satisfies AniDbEpisodeCacheRecord);
});

const upsertAniDbEpisodeCache = Effect.fn("AniDbUnitCacheRepository.upsert")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly mediaId: number;
    readonly mediaUnits: ReadonlyArray<AnimeMetadataEpisode>;
    readonly updatedAt: string;
  },
) {
  const encodedEpisodes = yield* encodeAniDbEpisodeCachePayload([...input.mediaUnits]).pipe(
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "AniDB episode cache payload is invalid",
        }),
    ),
  );

  yield* exec.runQuery(
    "Failed to upsert AniDB episode cache",
    db
      .insert(anidbEpisodeCache)
      .values({
        mediaId: input.mediaId,
        mediaUnits: encodedEpisodes,
        updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          mediaUnits: encodedEpisodes,
          updatedAt: input.updatedAt,
        },
        target: anidbEpisodeCache.mediaId,
      })
      .prepare()
      .effect(),
  );
});
