import { eq } from "drizzle-orm";
import { Effect, Option, Schema } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anidbEpisodeCache } from "@/db/schema.ts";
import {
  AnimeMetadataEpisodeSchema,
  type AnimeMetadataEpisode,
} from "@/features/media/metadata/anilist-model.ts";
import { MediaStoredDataError } from "@/features/media/errors.ts";
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

export const loadAniDbEpisodeCacheEffect = Effect.fn("AniDbEpisodeCacheRepository.load")(function* (
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
        new MediaStoredDataError({
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

export const upsertAniDbEpisodeCacheEffect = Effect.fn("AniDbEpisodeCacheRepository.upsert")(
  function* (input: {
    readonly mediaId: number;
    readonly db: AppDatabase;
    readonly mediaUnits: ReadonlyArray<AnimeMetadataEpisode>;
    readonly updatedAt: string;
  }) {
    const encodedEpisodes = yield* encodeAniDbEpisodeCachePayload([...input.mediaUnits]).pipe(
      Effect.mapError(
        (cause) =>
          new MediaStoredDataError({
            cause,
            message: "AniDB episode cache payload is invalid",
          }),
      ),
    );

    yield* tryDatabasePromise("Failed to upsert AniDB episode cache", () =>
      input.db
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
  },
);
