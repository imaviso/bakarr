import { Effect, Schema } from "effect";
import { eq } from "drizzle-orm";

import { DatabaseError } from "@/db/database.ts";
import type { AppDatabase } from "@/db/database.ts";
import { seasonalAnimeCache } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import type { SeasonalAnimeResponse } from "@packages/shared/index.ts";
import { SeasonalAnimeResponseSchema } from "@packages/shared/index.ts";

export const SEASONAL_ANIME_CACHE_TTL_MS = 1000 * 60 * 5;

const SeasonalAnimeResponseJsonSchema = Schema.parseJson(SeasonalAnimeResponseSchema);
const decodeSeasonalAnimeResponse = Schema.decodeUnknown(SeasonalAnimeResponseJsonSchema);
const encodeSeasonalAnimeResponse = Schema.encodeUnknown(SeasonalAnimeResponseJsonSchema);

export const readSeasonalAnimeCache = Effect.fn("SeasonalAnimeCache.read")(function* (
  db: AppDatabase,
  cacheKey: string,
  nowMs: number,
) {
  const cachedRows = yield* tryDatabasePromise("Failed to load seasonal anime cache", () =>
    db
      .select({
        payload: seasonalAnimeCache.payload,
        fetchedAtMs: seasonalAnimeCache.fetchedAtMs,
      })
      .from(seasonalAnimeCache)
      .where(eq(seasonalAnimeCache.cacheKey, cacheKey))
      .limit(1),
  );
  const cached = cachedRows[0];

  if (cached && nowMs - cached.fetchedAtMs < SEASONAL_ANIME_CACHE_TTL_MS) {
    return yield* decodeSeasonalAnimeResponse(cached.payload).pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseError({
            cause,
            message: "Failed to decode seasonal anime cache payload",
          }),
      ),
    );
  }

  return null;
});

export const writeSeasonalAnimeCache = Effect.fn("SeasonalAnimeCache.write")(function* (
  db: AppDatabase,
  cacheKey: string,
  response: SeasonalAnimeResponse,
  nowMs: number,
) {
  const encodedPayload = yield* encodeSeasonalAnimeResponse(response).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseError({
          cause,
          message: "Failed to encode seasonal anime cache payload",
        }),
    ),
  );

  yield* tryDatabasePromise("Failed to upsert seasonal anime cache", () =>
    db
      .insert(seasonalAnimeCache)
      .values({
        cacheKey,
        season: response.season,
        year: response.year,
        limit: response.limit,
        page: response.page,
        payload: encodedPayload,
        fetchedAtMs: nowMs,
      })
      .onConflictDoUpdate({
        target: seasonalAnimeCache.cacheKey,
        set: {
          fetchedAtMs: nowMs,
          limit: response.limit,
          page: response.page,
          payload: encodedPayload,
          season: response.season,
          year: response.year,
        },
      }),
  );
});
