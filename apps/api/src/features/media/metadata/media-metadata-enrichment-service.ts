import { eq } from "drizzle-orm";
import { Cause, Context, Effect, Layer, Option, Queue, Ref } from "effect";

import { Database, type DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { AniDbClient } from "@/features/media/metadata/anidb.ts";
import {
  loadAniDbEpisodeCacheEffect,
  upsertAniDbEpisodeCacheEffect,
} from "@/features/media/units/anidb-unit-cache-repository.ts";
import type { AniDbEpisodeLookupInput } from "@/features/media/metadata/anidb-protocol.ts";
import type { AnimeMetadataEpisode } from "@/features/media/metadata/anilist-model.ts";
import { syncEpisodeMetadataEffect } from "@/features/media/units/media-unit-metadata-sync.ts";
import { AniDbRuntimeConfigError, type MediaStoredDataError } from "@/features/media/errors.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

const ANIDB_CACHE_STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const ANIDB_REFRESH_QUEUE_CAPACITY = 256;

export interface AniDbRefreshRequest extends AniDbEpisodeLookupInput {
  readonly mediaId: number;
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
      readonly mediaUnits: ReadonlyArray<AnimeMetadataEpisode>;
      readonly updatedAt: string;
    };

export interface AnimeMetadataEnrichmentServiceShape {
  readonly getAniDbCacheState: (
    mediaId: number,
  ) => Effect.Effect<
    AnimeMetadataEnrichmentCacheState,
    DatabaseError | MediaStoredDataError | AniDbRuntimeConfigError
  >;
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
      Queue.dropping<AniDbRefreshRequest>(ANIDB_REFRESH_QUEUE_CAPACITY),
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
          mediaId: request.mediaId,
          db,
          mediaUnits: [],
          updatedAt,
        });

        yield* Effect.logInfo("AniDB refresh skipped").pipe(
          Effect.annotateLogs({
            mediaId: request.mediaId,
            reason: lookupResult.reason,
          }),
        );
        return;
      }

      yield* upsertAniDbEpisodeCacheEffect({
        mediaId: request.mediaId,
        db,
        mediaUnits: lookupResult.mediaUnits,
        updatedAt,
      });

      const existingAnimeRows = yield* tryDatabasePromise("Failed to check media existence", () =>
        db.select({ id: media.id }).from(media).where(eq(media.id, request.mediaId)).limit(1),
      );

      if (existingAnimeRows[0]) {
        yield* syncEpisodeMetadataEffect(db, request.mediaId, lookupResult.mediaUnits);
      }
    });

    yield* Queue.take(queue).pipe(
      Effect.flatMap((request) =>
        runAniDbRefresh(request).pipe(
          Effect.catchAllCause((cause) =>
            Effect.logWarning("AniDB background refresh failed").pipe(
              Effect.annotateLogs({
                mediaId: request.mediaId,
                cause: Cause.pretty(cause),
              }),
            ),
          ),
          Effect.ensuring(
            Ref.update(queuedAnimeIdsRef, (queuedAnimeIds) => {
              const nextQueuedAnimeIds = new Set(queuedAnimeIds);
              nextQueuedAnimeIds.delete(request.mediaId);
              return nextQueuedAnimeIds;
            }),
          ),
        ),
      ),
      Effect.forever,
      Effect.forkScoped,
    );

    const getAniDbCacheState = Effect.fn("AnimeMetadataEnrichmentService.getAniDbCacheState")(
      function* (mediaId: number) {
        const cacheEntryOption = yield* loadAniDbEpisodeCacheEffect(db, mediaId);

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
          mediaUnits: cacheEntry.mediaUnits,
          updatedAt: cacheEntry.updatedAt,
        } as const satisfies AnimeMetadataEnrichmentCacheState;
      },
    );

    const requestAniDbRefresh = Effect.fn("AnimeMetadataEnrichmentService.requestAniDbRefresh")(
      function* (request: AniDbRefreshRequest) {
        const shouldQueue = yield* Ref.modify(queuedAnimeIdsRef, (queuedAnimeIds) => {
          if (queuedAnimeIds.has(request.mediaId)) {
            return [false, queuedAnimeIds] as const;
          }

          const nextQueuedAnimeIds = new Set(queuedAnimeIds);
          nextQueuedAnimeIds.add(request.mediaId);
          return [true, nextQueuedAnimeIds] as const;
        });

        if (!shouldQueue) {
          return;
        }

        const offered = yield* Queue.offer(queue, request);

        if (offered) {
          return;
        }

        yield* Ref.update(queuedAnimeIdsRef, (queuedAnimeIds) => {
          const nextQueuedAnimeIds = new Set(queuedAnimeIds);
          nextQueuedAnimeIds.delete(request.mediaId);
          return nextQueuedAnimeIds;
        });

        yield* Effect.logWarning("AniDB refresh queue full; dropped request").pipe(
          Effect.annotateLogs({
            mediaId: request.mediaId,
            queueCapacity: ANIDB_REFRESH_QUEUE_CAPACITY,
          }),
        );
      },
    );

    return AnimeMetadataEnrichmentService.of({
      getAniDbCacheState,
      requestAniDbRefresh,
    });
  }),
);
