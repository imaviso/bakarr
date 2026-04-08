import { eq } from "drizzle-orm";
import { Cause, Context, Effect, Layer, Option, Queue, Ref } from "effect";

import { Database, type DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { AniDbClient } from "@/features/anime/anidb.ts";
import {
  loadAniDbEpisodeCacheEffect,
  upsertAniDbEpisodeCacheEffect,
} from "@/features/anime/anidb-episode-cache-repository.ts";
import type { AniDbEpisodeLookupInput } from "@/features/anime/anidb-types.ts";
import type { AnimeMetadataEpisode } from "@/features/anime/anilist-model.ts";
import { syncEpisodeMetadataEffect } from "@/features/anime/anime-episode-metadata-sync.ts";
import { type AnimeStoredDataError } from "@/features/anime/errors.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

const ANIDB_CACHE_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export interface AniDbRefreshRequest extends AniDbEpisodeLookupInput {
  readonly animeId: number;
}

export type AnimeMetadataEnrichmentCacheState =
  | {
      readonly _tag: "Missing";
    }
  | {
      readonly _tag: "Stale";
      readonly updatedAt: string;
    }
  | {
      readonly _tag: "Fresh";
      readonly episodes: ReadonlyArray<AnimeMetadataEpisode>;
      readonly updatedAt: string;
    };

export interface AnimeMetadataEnrichmentServiceShape {
  readonly getAniDbCacheState: (
    animeId: number,
  ) => Effect.Effect<AnimeMetadataEnrichmentCacheState, DatabaseError | AnimeStoredDataError>;
  readonly requestAniDbRefresh: (request: AniDbRefreshRequest) => Effect.Effect<void>;
}

export class AnimeMetadataEnrichmentService extends Context.Tag(
  "@bakarr/api/AnimeMetadataEnrichmentService",
)<AnimeMetadataEnrichmentService, AnimeMetadataEnrichmentServiceShape>() {}

export const AnimeMetadataEnrichmentServiceLive = Layer.scoped(
  AnimeMetadataEnrichmentService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const aniDb = yield* AniDbClient;
    const clock = yield* ClockService;
    const queue = yield* Effect.acquireRelease(
      Queue.unbounded<AniDbRefreshRequest>(),
      Queue.shutdown,
    );
    const queuedAnimeIdsRef = yield* Ref.make(new Set<number>());

    const runAniDbRefresh = Effect.fn("AnimeMetadataEnrichmentService.runAniDbRefresh")(function* (
      request: AniDbRefreshRequest,
    ) {
      const lookupResult = yield* aniDb.getEpisodeMetadata(request);
      const updatedAt = yield* nowIsoFromClock(clock);

      if (lookupResult._tag === "AniDbLookupSkipped") {
        yield* upsertAniDbEpisodeCacheEffect({
          animeId: request.animeId,
          db,
          episodes: [],
          updatedAt,
        });

        yield* Effect.logInfo("AniDB refresh skipped").pipe(
          Effect.annotateLogs({
            animeId: request.animeId,
            reason: lookupResult.reason,
          }),
        );
        return;
      }

      yield* upsertAniDbEpisodeCacheEffect({
        animeId: request.animeId,
        db,
        episodes: lookupResult.episodes,
        updatedAt,
      });

      const existingAnimeRows = yield* tryDatabasePromise("Failed to check anime existence", () =>
        db.select({ id: anime.id }).from(anime).where(eq(anime.id, request.animeId)).limit(1),
      );

      if (existingAnimeRows[0]) {
        yield* syncEpisodeMetadataEffect(db, request.animeId, lookupResult.episodes);
      }
    });

    yield* Queue.take(queue).pipe(
      Effect.flatMap((request) =>
        runAniDbRefresh(request).pipe(
          Effect.catchAllCause((cause) =>
            Effect.logWarning("AniDB background refresh failed").pipe(
              Effect.annotateLogs({
                animeId: request.animeId,
                cause: Cause.pretty(cause),
              }),
            ),
          ),
          Effect.ensuring(
            Ref.update(queuedAnimeIdsRef, (queuedAnimeIds) => {
              const nextQueuedAnimeIds = new Set(queuedAnimeIds);
              nextQueuedAnimeIds.delete(request.animeId);
              return nextQueuedAnimeIds;
            }),
          ),
        ),
      ),
      Effect.forever,
      Effect.forkScoped,
    );

    const getAniDbCacheState = Effect.fn("AnimeMetadataEnrichmentService.getAniDbCacheState")(
      function* (animeId: number) {
        const cacheEntryOption = yield* loadAniDbEpisodeCacheEffect(db, animeId);

        if (Option.isNone(cacheEntryOption)) {
          return {
            _tag: "Missing",
          } as const satisfies AnimeMetadataEnrichmentCacheState;
        }

        const cacheEntry = cacheEntryOption.value;
        const nowMillis = yield* clock.currentTimeMillis;
        const updatedAtMillis = Date.parse(cacheEntry.updatedAt);

        if (
          !Number.isFinite(updatedAtMillis) ||
          nowMillis - updatedAtMillis > ANIDB_CACHE_STALE_AFTER_MS
        ) {
          return {
            _tag: "Stale",
            updatedAt: cacheEntry.updatedAt,
          } as const satisfies AnimeMetadataEnrichmentCacheState;
        }

        return {
          _tag: "Fresh",
          episodes: cacheEntry.episodes,
          updatedAt: cacheEntry.updatedAt,
        } as const satisfies AnimeMetadataEnrichmentCacheState;
      },
    );

    const requestAniDbRefresh = Effect.fn("AnimeMetadataEnrichmentService.requestAniDbRefresh")(
      function* (request: AniDbRefreshRequest) {
        const shouldQueue = yield* Ref.modify(queuedAnimeIdsRef, (queuedAnimeIds) => {
          if (queuedAnimeIds.has(request.animeId)) {
            return [false, queuedAnimeIds] as const;
          }

          const nextQueuedAnimeIds = new Set(queuedAnimeIds);
          nextQueuedAnimeIds.add(request.animeId);
          return [true, nextQueuedAnimeIds] as const;
        });

        if (!shouldQueue) {
          return;
        }

        yield* Queue.offer(queue, request);
      },
    );

    return AnimeMetadataEnrichmentService.of({
      getAniDbCacheState,
      requestAniDbRefresh,
    });
  }),
);
