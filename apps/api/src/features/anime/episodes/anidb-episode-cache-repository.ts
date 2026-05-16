import { eq } from "drizzle-orm";
import { Effect, Option, Schema } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anidbEpisodeCache } from "@/db/schema.ts";
import {
  AnimeMetadataEpisodeSchema,
  type AnimeMetadataEpisode,
} from "@/features/anime/metadata/anilist-model.ts";
import { AnimeStoredDataError } from "@/features/anime/errors.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

const AniDbEpisodeCachePayloadJsonSchema = Schema.parseJson(
  Schema.Array(AnimeMetadataEpisodeSchema),
);

const decodeAniDbEpisodeCachePayload = Schema.decodeUnknown(AniDbEpisodeCachePayloadJsonSchema);
const encodeAniDbEpisodeCachePayload = Schema.encode(AniDbEpisodeCachePayloadJsonSchema);

export interface AniDbEpisodeCacheRecord {
  readonly animeId: number;
  readonly episodes: ReadonlyArray<AnimeMetadataEpisode>;
  readonly updatedAt: string;
}

export const loadAniDbEpisodeCacheEffect = Effect.fn("AniDbEpisodeCacheRepository.load")(function* (
  db: AppDatabase,
  animeId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load AniDB episode cache", () =>
    db
      .select({
        animeId: anidbEpisodeCache.animeId,
        episodes: anidbEpisodeCache.episodes,
        updatedAt: anidbEpisodeCache.updatedAt,
      })
      .from(anidbEpisodeCache)
      .where(eq(anidbEpisodeCache.animeId, animeId))
      .limit(1),
  );

  const row = rows[0];

  if (!row) {
    return Option.none<AniDbEpisodeCacheRecord>();
  }

  const decodedEpisodes = yield* decodeAniDbEpisodeCachePayload(row.episodes).pipe(
    Effect.mapError(
      (cause) =>
        new AnimeStoredDataError({
          cause,
          message: "AniDB episode cache is corrupt",
        }),
    ),
  );

  return Option.some({
    animeId: row.animeId,
    episodes: decodedEpisodes,
    updatedAt: row.updatedAt,
  } satisfies AniDbEpisodeCacheRecord);
});

export const upsertAniDbEpisodeCacheEffect = Effect.fn("AniDbEpisodeCacheRepository.upsert")(
  function* (input: {
    readonly animeId: number;
    readonly db: AppDatabase;
    readonly episodes: ReadonlyArray<AnimeMetadataEpisode>;
    readonly updatedAt: string;
  }) {
    const encodedEpisodes = yield* encodeAniDbEpisodeCachePayload([...input.episodes]).pipe(
      Effect.mapError(
        (cause) =>
          new AnimeStoredDataError({
            cause,
            message: "AniDB episode cache payload is invalid",
          }),
      ),
    );

    yield* tryDatabasePromise("Failed to upsert AniDB episode cache", () =>
      input.db
        .insert(anidbEpisodeCache)
        .values({
          animeId: input.animeId,
          episodes: encodedEpisodes,
          updatedAt: input.updatedAt,
        })
        .onConflictDoUpdate({
          set: {
            episodes: encodedEpisodes,
            updatedAt: input.updatedAt,
          },
          target: anidbEpisodeCache.animeId,
        }),
    );
  },
);
