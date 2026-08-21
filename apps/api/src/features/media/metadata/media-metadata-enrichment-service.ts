import { Cause, DateTime, Duration, Effect, HashSet, Option, Queue, Ref } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { AniDbClient } from "@/features/media/metadata/anidb.ts";
import { AniDbUnitCacheRepository } from "@/features/media/units/anidb-unit-cache-repository.ts";
import type { AniDbEpisodeLookupInput } from "@/features/media/metadata/anidb-protocol.ts";
import type { AnimeMetadataEpisode } from "@/features/media/metadata/metadata-model.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import type { StoredDataError } from "@/features/errors.ts";
import { AniDbRuntimeConfigError } from "@/features/media/errors.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";

const ANIDB_CACHE_STALE_AFTER = Duration.hours(6);
const ANIDB_REFRESH_QUEUE_CAPACITY = 256;

export interface AniDbRefreshRequest extends AniDbEpisodeLookupInput {
  readonly mediaId: number;
}

export type MediaMetadataEnrichmentCacheState =
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

export interface MediaMetadataEnrichmentServiceShape {
  readonly getAniDbCacheState: (
    mediaId: number,
  ) => Effect.Effect<
    MediaMetadataEnrichmentCacheState,
    DatabaseError | StoredDataError | AniDbRuntimeConfigError
  >;
  readonly requestAniDbRefresh: (request: AniDbRefreshRequest) => Effect.Effect<void>;
}

const makeMediaMetadataEnrichmentService = Effect.fn("MediaMetadataEnrichmentService.make")(
  function* () {
    const aniDb = yield* AniDbClient;
    const aniDbUnitCacheRepository = yield* AniDbUnitCacheRepository;
    const mediaRepository = yield* MediaRepository;
    const mediaUnitRepository = yield* MediaUnitRepository;
    const queue = yield* Effect.acquireRelease(
      Queue.dropping<AniDbRefreshRequest>(ANIDB_REFRESH_QUEUE_CAPACITY),
      Queue.shutdown,
    );
    const queuedAnimeIdsRef = yield* Ref.make(HashSet.empty<number>());

    const runAniDbRefresh = Effect.fn("MediaMetadataEnrichmentService.runAniDbRefresh")(function* (
      request: AniDbRefreshRequest,
    ) {
      const lookupResult = yield* aniDb.getEpisodeMetadata(request);

      if (lookupResult._tag === "AniDbLookupSkipped") {
        // A transient skip (disabled provider, missing credentials, …) must
        // not overwrite or refresh a cached entry — only successful lookups
        // may touch cache freshness.
        yield* Effect.logInfo("AniDB refresh skipped").pipe(
          Effect.annotateLogs({
            mediaId: request.mediaId,
            reason: lookupResult.reason,
          }),
        );
        return;
      }

      const updatedAt = yield* currentNowIso();

      yield* aniDbUnitCacheRepository.upsert({
        mediaId: request.mediaId,
        mediaUnits: lookupResult.mediaUnits,
        updatedAt,
      });

      const exists = yield* mediaRepository.mediaExists(request.mediaId);

      if (exists) {
        yield* mediaUnitRepository.syncUnitMetadata(request.mediaId, lookupResult.mediaUnits);
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
            Ref.update(queuedAnimeIdsRef, (queuedAnimeIds) =>
              HashSet.remove(queuedAnimeIds, request.mediaId),
            ),
          ),
        ),
      ),
      Effect.forever,
      Effect.forkScoped,
    );

    const getAniDbCacheState = Effect.fn("MediaMetadataEnrichmentService.getAniDbCacheState")(
      function* (mediaId: number) {
        const cacheEntryOption = yield* aniDbUnitCacheRepository.load(mediaId);

        if (Option.isNone(cacheEntryOption)) {
          return {
            _tag: "Missing",
          } satisfies MediaMetadataEnrichmentCacheState;
        }

        const cacheEntry = cacheEntryOption.value;
        const now = yield* DateTime.now;
        const updatedAt = DateTime.unsafeFromDate(new Date(cacheEntry.updatedAt));
        const staleFor = DateTime.distanceDuration(now, updatedAt);

        if (Duration.greaterThan(staleFor, ANIDB_CACHE_STALE_AFTER)) {
          return {
            _tag: "Stale",
            updatedAt: cacheEntry.updatedAt,
          } satisfies MediaMetadataEnrichmentCacheState;
        }

        return {
          _tag: "Fresh",
          mediaUnits: cacheEntry.mediaUnits,
          updatedAt: cacheEntry.updatedAt,
        } satisfies MediaMetadataEnrichmentCacheState;
      },
    );

    const requestAniDbRefresh = Effect.fn("MediaMetadataEnrichmentService.requestAniDbRefresh")(
      function* (request: AniDbRefreshRequest) {
        const shouldQueue = yield* Ref.modify(
          queuedAnimeIdsRef,
          (queuedAnimeIds): [boolean, HashSet.HashSet<number>] => {
            if (HashSet.has(queuedAnimeIds, request.mediaId)) {
              return [false, queuedAnimeIds];
            }

            return [true, HashSet.add(queuedAnimeIds, request.mediaId)];
          },
        );

        if (!shouldQueue) {
          return;
        }

        const offered = yield* Queue.offer(queue, request);

        if (offered) {
          return;
        }

        yield* Ref.update(queuedAnimeIdsRef, (queuedAnimeIds) =>
          HashSet.remove(queuedAnimeIds, request.mediaId),
        );

        yield* Effect.logWarning("AniDB refresh queue full; dropped request").pipe(
          Effect.annotateLogs({
            mediaId: request.mediaId,
            queueCapacity: ANIDB_REFRESH_QUEUE_CAPACITY,
          }),
        );
      },
    );

    return {
      getAniDbCacheState,
      requestAniDbRefresh,
    } satisfies MediaMetadataEnrichmentServiceShape;
  },
);

export class MediaMetadataEnrichmentService extends Effect.Service<MediaMetadataEnrichmentService>()(
  "@bakarr/api/MediaMetadataEnrichmentService",
  {
    scoped: makeMediaMetadataEnrichmentService(),
    dependencies: [
      AniDbUnitCacheRepository.Default,
      MediaRepository.Default,
      MediaUnitRepository.Default,
    ],
  },
) {}

export const MediaMetadataEnrichmentServiceLive = MediaMetadataEnrichmentService.Default;
