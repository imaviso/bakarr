import { eq } from "drizzle-orm";
import { Effect, Option, Schema } from "effect";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { anidbEpisodeCache } from "@/db/schema.ts";
import {
  AnimeMetadataEpisodeSchema,
  type AnimeMetadataEpisode,
} from "@/features/media/metadata/anilist-model.ts";
import { StoredDataError } from "@/features/errors.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

const AniDbEpisodeCachePayloadJsonSchema = Schema.parseJson(
  Schema.Array(AnimeMetadataEpisodeSchema),
);

const decodeAniDbEpisodeCachePayload = Schema.decodeUnknown(AniDbEpisodeCachePayloadJsonSchema);
const encodeAniDbEpisodeCachePayload = Schema.encode(AniDbEpisodeCachePayloadJsonSchema);

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

export class AniDbUnitCacheRepository extends Effect.Service<AniDbUnitCacheRepository>()(
  "@bakarr/api/AniDbUnitCacheRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeAniDbUnitCacheRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

function makeAniDbUnitCacheRepositoryShape(db: AppDatabase): AniDbUnitCacheRepositoryShape {
  return {
    load: (mediaId) => loadAniDbEpisodeCache(db, mediaId),
    upsert: (input) => upsertAniDbEpisodeCache(db, input),
  };
}

export function makeAniDbUnitCacheRepository(db: AppDatabase): AniDbUnitCacheRepository {
  return AniDbUnitCacheRepository.make(makeAniDbUnitCacheRepositoryShape(db));
}

const loadAniDbEpisodeCache = Effect.fn("AniDbUnitCacheRepository.load")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load AniDB episode cache", () =>
    db
      .select({
        mediaId: anidbEpisodeCache.mediaId,
        mediaUnits: anidbEpisodeCache.mediaUnits,
        updatedAt: anidbEpisodeCache.updatedAt,
      })
      .from(anidbEpisodeCache)
      .where(eq(anidbEpisodeCache.mediaId, mediaId))
      .limit(1),
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

  yield* tryDatabasePromise("Failed to upsert AniDB episode cache", () =>
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
      }),
  );
});
