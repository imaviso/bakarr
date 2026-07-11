import { Effect, Schema } from "effect";
import { eq } from "drizzle-orm";

import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { seasonalAnimeCache } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import type { SeasonalMediaResponse } from "@packages/shared/index.ts";
import { SeasonalMediaResponseSchema } from "@packages/shared/index.ts";

export const SEASONAL_ANIME_CACHE_TTL_MS = 1000 * 60 * 5;

const SeasonalAnimeResponseJsonSchema = Schema.parseJson(SeasonalMediaResponseSchema);
const decodeSeasonalAnimeResponse = Schema.decodeUnknown(SeasonalAnimeResponseJsonSchema);
const encodeSeasonalAnimeResponse = Schema.encodeUnknown(SeasonalAnimeResponseJsonSchema);

export interface SeasonalMediaCacheRepositoryShape {
  readonly read: (
    cacheKey: string,
    nowMs: number,
  ) => Effect.Effect<SeasonalMediaResponse | null, DatabaseError>;
  readonly readStale: (
    cacheKey: string,
  ) => Effect.Effect<SeasonalMediaResponse | null, DatabaseError>;
  readonly write: (
    cacheKey: string,
    response: SeasonalMediaResponse,
    nowMs: number,
  ) => Effect.Effect<void, DatabaseError>;
}

export class SeasonalMediaCacheRepository extends Effect.Service<SeasonalMediaCacheRepository>()(
  "@bakarr/api/SeasonalMediaCacheRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeSeasonalMediaCacheRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export function makeSeasonalMediaCacheRepository(db: AppDatabase): SeasonalMediaCacheRepository {
  return SeasonalMediaCacheRepository.make(makeSeasonalMediaCacheRepositoryShape(db));
}

function makeSeasonalMediaCacheRepositoryShape(db: AppDatabase): SeasonalMediaCacheRepositoryShape {
  return {
    read: (cacheKey, nowMs) => readSeasonalMediaCacheEffect(db, cacheKey, nowMs),
    readStale: (cacheKey) => readStaleSeasonalMediaCacheEffect(db, cacheKey),
    write: (cacheKey, response, nowMs) =>
      writeSeasonalMediaCacheEffect(db, cacheKey, response, nowMs),
  } satisfies SeasonalMediaCacheRepositoryShape;
}

const readSeasonalMediaCacheEffect = Effect.fn("SeasonalMediaCacheRepository.read")(function* (
  db: AppDatabase,
  cacheKey: string,
  nowMs: number,
) {
  const cached = yield* readSeasonalMediaCacheRowEffect(db, cacheKey);

  if (cached && nowMs - cached.fetchedAtMs < SEASONAL_ANIME_CACHE_TTL_MS) {
    return yield* decodeSeasonalAnimeCachePayloadEffect(cached.payload);
  }

  return null;
});

const readStaleSeasonalMediaCacheEffect = Effect.fn("SeasonalMediaCacheRepository.readStale")(
  function* (db: AppDatabase, cacheKey: string) {
    const cached = yield* readSeasonalMediaCacheRowEffect(db, cacheKey);

    if (!cached) {
      return null;
    }

    return yield* decodeSeasonalAnimeCachePayloadEffect(cached.payload);
  },
);

const readSeasonalMediaCacheRowEffect = Effect.fn("SeasonalMediaCacheRepository.readRow")(
  function* (db: AppDatabase, cacheKey: string) {
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
  },
);

const decodeSeasonalAnimeCachePayloadEffect = Effect.fn(
  "SeasonalMediaCacheRepository.decodePayload",
)(function* (payload: string) {
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

const writeSeasonalMediaCacheEffect = Effect.fn("SeasonalMediaCacheRepository.write")(function* (
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
