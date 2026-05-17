import { Effect, Schema } from "effect";
import { eq } from "drizzle-orm";

import { DatabaseError } from "@/db/database.ts";
import type { AppDatabase } from "@/db/database.ts";
import { seasonalAnimeCache } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import type { SeasonalMediaResponse } from "@packages/shared/index.ts";
import { SeasonalMediaResponseSchema } from "@packages/shared/index.ts";

export const SEASONAL_ANIME_CACHE_TTL_MS = 1000 * 60 * 5;

const SeasonalAnimeResponseJsonSchema = Schema.parseJson(SeasonalMediaResponseSchema);
const decodeSeasonalAnimeResponse = Schema.decodeUnknown(SeasonalAnimeResponseJsonSchema);
const encodeSeasonalAnimeResponse = Schema.encodeUnknown(SeasonalAnimeResponseJsonSchema);

export const readSeasonalAnimeCache = Effect.fn("SeasonalAnimeCache.read")(function* (
  db: AppDatabase,
  cacheKey: string,
  nowMs: number,
) {
  const cached = yield* readSeasonalAnimeCacheRow(db, cacheKey);

  if (cached && nowMs - cached.fetchedAtMs < SEASONAL_ANIME_CACHE_TTL_MS) {
    return yield* decodeSeasonalAnimeCachePayload(cached.payload);
  }

  return null;
});

export const readStaleSeasonalAnimeCache = Effect.fn("SeasonalAnimeCache.readStale")(function* (
  db: AppDatabase,
  cacheKey: string,
) {
  const cached = yield* readSeasonalAnimeCacheRow(db, cacheKey);

  if (!cached) {
    return null;
  }

  return yield* decodeSeasonalAnimeCachePayload(cached.payload);
});

const readSeasonalAnimeCacheRow = Effect.fn("SeasonalAnimeCache.readRow")(function* (
  db: AppDatabase,
  cacheKey: string,
) {
  const cachedRows = yield* tryDatabasePromise("Failed to load seasonal media cache", () =>
    db
      .select({
        payload: seasonalAnimeCache.payload,
        fetchedAtMs: seasonalAnimeCache.fetchedAtMs,
      })
      .from(seasonalAnimeCache)
      .where(eq(seasonalAnimeCache.cacheKey, cacheKey))
      .limit(1),
  );

  return cachedRows[0] ?? null;
});

const decodeSeasonalAnimeCachePayload = Effect.fn("SeasonalAnimeCache.decodePayload")(function* (
  payload: string,
) {
  return yield* decodeSeasonalAnimeResponse(payload).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseError({
          cause,
          message: "Failed to decode seasonal media cache payload",
        }),
    ),
  );
});

export const writeSeasonalAnimeCache = Effect.fn("SeasonalAnimeCache.write")(function* (
  db: AppDatabase,
  cacheKey: string,
  response: SeasonalMediaResponse,
  nowMs: number,
) {
  const encodedPayload = yield* encodeSeasonalAnimeResponse(response).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseError({
          cause,
          message: "Failed to encode seasonal media cache payload",
        }),
    ),
  );

  yield* tryDatabasePromise("Failed to upsert seasonal media cache", () =>
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
