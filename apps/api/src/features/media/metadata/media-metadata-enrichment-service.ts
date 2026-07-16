import { Cause, Effect, Option, Queue, Ref } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { AniDbClient } from "@/features/media/metadata/anidb.ts";
import { AniDbUnitCacheRepository } from "@/features/media/units/anidb-unit-cache-repository.ts";
import type { AniDbEpisodeLookupInput } from "@/features/media/metadata/anidb-protocol.ts";
import type { AnimeMetadataEpisode } from "@/features/media/metadata/anilist-model.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import type { StoredDataError } from "@/features/errors.ts";
import { AniDbRuntimeConfigError } from "@/features/media/errors.ts";
import { currentTimeMillis, nowIso as currentNowIso } from "@/infra/time.ts";

const ANIDB_CACHE_STALE_AFTER_MS = 6 * 60 * 60 * 1000;
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
    const mediaReadRepository = yield* MediaRepository;
    const mediaUnitRepository = yield* MediaUnitRepository;
    const queue = yield* Effect.acquireRelease(
      Queue.dropping<AniDbRefreshRequest>(ANIDB_REFRESH_QUEUE_CAPACITY),
      Queue.shutdown,
    );
    const queuedAnimeIdsRef = yield* Ref.make(new Set<number>());

    const runAniDbRefresh = Effect.fn("MediaMetadataEnrichmentService.runAniDbRefresh")(function* (
      request: AniDbRefreshRequest,
    ) {
      const lookupResult = yield* aniDb.getEpisodeMetadata(request);
      const updatedAt = yield* currentNowIso();

      if (lookupResult._tag === "AniDbLookupSkipped") {
        yield* aniDbUnitCacheRepository.upsert({
          mediaId: request.mediaId,
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

      yield* aniDbUnitCacheRepository.upsert({
        mediaId: request.mediaId,
        mediaUnits: lookupResult.mediaUnits,
        updatedAt,
      });

      const exists = yield* mediaReadRepository.mediaExists(request.mediaId);

      if (exists) {
        yield* mediaUnitRepository.syncEpisodeMetadata(request.mediaId, lookupResult.mediaUnits);
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

    const getAniDbCacheState = Effect.fn("MediaMetadataEnrichmentService.getAniDbCacheState")(
      function* (mediaId: number) {
        const cacheEntryOption = yield* aniDbUnitCacheRepository.load(mediaId);

        if (Option.isNone(cacheEntryOption)) {
          return {
            _tag: "Missing",
          } as const satisfies MediaMetadataEnrichmentCacheState;
        }

        const cacheEntry = cacheEntryOption.value;
        const nowMillis = yield* currentTimeMillis;
        const updatedAtMillis = Date.parse(cacheEntry.updatedAt);

        if (
          !Number.isFinite(updatedAtMillis) ||
          nowMillis - updatedAtMillis > ANIDB_CACHE_STALE_AFTER_MS
        ) {
          return {
            _tag: "Stale",
            updatedAt: cacheEntry.updatedAt,
          } as const satisfies MediaMetadataEnrichmentCacheState;
        }

        return {
          _tag: "Fresh",
          mediaUnits: cacheEntry.mediaUnits,
          updatedAt: cacheEntry.updatedAt,
        } as const satisfies MediaMetadataEnrichmentCacheState;
      },
    );

    const requestAniDbRefresh = Effect.fn("MediaMetadataEnrichmentService.requestAniDbRefresh")(
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
