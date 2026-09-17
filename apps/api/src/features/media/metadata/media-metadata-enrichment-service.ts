import { Context, DateTime, Duration, Effect, HashSet, Layer, Option, Queue, Ref } from "effect";
import type { DatabaseError } from "@/db/database.ts";
import { AniDbClient } from "@/features/media/metadata/anidb.ts";
import { AniDbMissCacheRepository } from "@/features/media/units/anidb-miss-cache-repository.ts";
import { AniDbUnitCacheRepository } from "@/features/media/units/anidb-unit-cache-repository.ts";
import type { AniDbEpisodeLookupInput } from "@/features/media/metadata/anidb-protocol.ts";
import type { AnimeMetadataEpisode } from "@/features/media/metadata/metadata-model.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import type { StoredDataError } from "@/features/errors.ts";
import { AniDbRuntimeConfigError } from "@/features/media/errors.ts";
import { causeLogAnnotations } from "@/infra/logging.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";

const ANIDB_CACHE_STALE_AFTER = Duration.hours(6);
// Negative title_not_found entries only skip paced UDP work; episode data
// still wins when present and a later success clears the miss. 24h bounds
// re-discovery delay for shows AniDB adds late while cutting repeat
// AUTH + ANIME bursts for chronic misses.
const ANIDB_MISS_TTL = Duration.hours(24);
const ANIDB_REFRESH_QUEUE_CAPACITY = 256;

export interface AniDbRefreshRequest extends AniDbEpisodeLookupInput {
  readonly mediaId: number;
}

// Identity of the title set an aid resolution attempted. A miss suppresses
// only retries for the same titles: a user-corrected or upstream-updated
// title must re-arm the lookup immediately instead of waiting out the TTL.
// unitCount is excluded — aid resolution never depends on it.
export function buildAniDbMissTitleKey(input: AniDbEpisodeLookupInput): string {
  return JSON.stringify({
    english: input.title.english ?? null,
    native: input.title.native ?? null,
    romaji: input.title.romaji,
    synonyms: input.synonyms ?? [],
  });
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
    const aniDbMissCacheRepository = yield* AniDbMissCacheRepository;
    const mediaRepository = yield* MediaRepository;
    const mediaUnitRepository = yield* MediaUnitRepository;
    const queue = yield* Effect.acquireRelease(
      Queue.dropping<AniDbRefreshRequest>(ANIDB_REFRESH_QUEUE_CAPACITY),
      Queue.shutdown,
    );
    const queuedAnimeIdsRef = yield* Ref.make(HashSet.empty<number>());

    const isFreshMiss = Effect.fn("MediaMetadataEnrichmentService.isFreshMiss")(function* (
      mediaId: number,
      titleKey: string,
    ) {
      const missOption = yield* aniDbMissCacheRepository
        .load(mediaId)
        .pipe(
          Effect.catch((cause) =>
            Effect.logWarning("AniDB miss cache lookup degraded").pipe(
              Effect.annotateLogs({ error: cause.message, mediaId }),
              Effect.as(Option.none()),
            ),
          ),
        );

      if (Option.isNone(missOption)) {
        return false;
      }

      const miss = missOption.value;

      if (miss.titleKey !== titleKey) {
        return false;
      }

      const now = yield* DateTime.now;
      // distance(self, other) = other - self, so the earlier timestamp goes
      // first. A non-positive age means the clock moved backward past the
      // stored stamp — expire instead of sticking.
      const age = DateTime.distance(DateTime.makeUnsafe(new Date(miss.updatedAt)), now);
      return Duration.toMillis(age) > 0 && !Duration.isGreaterThan(age, ANIDB_MISS_TTL);
    });

    const runAniDbRefresh = Effect.fn("MediaMetadataEnrichmentService.runAniDbRefresh")(function* (
      request: AniDbRefreshRequest,
    ) {
      const lookupResult = yield* aniDb.getEpisodeMetadata(request);

      if (lookupResult._tag === "AniDbLookupSkipped") {
        // Only title_not_found burns UDP packets (AUTH + ANIME attempts), so
        // only it earns a negative entry. Other skips are config/transient
        // and must not suppress future lookups.
        if (lookupResult.reason === "title_not_found") {
          const missedAt = yield* currentNowIso();
          yield* aniDbMissCacheRepository.record({
            mediaId: request.mediaId,
            titleKey: buildAniDbMissTitleKey(request),
            updatedAt: missedAt,
          });
        }
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
      yield* aniDbMissCacheRepository.clear(request.mediaId);

      const exists = yield* mediaRepository.mediaExists(request.mediaId);

      if (exists) {
        yield* mediaUnitRepository.syncUnitMetadata(request.mediaId, lookupResult.mediaUnits);
      }
    });

    yield* Queue.take(queue).pipe(
      Effect.flatMap((request) =>
        runAniDbRefresh(request).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("AniDB background refresh failed").pipe(
              Effect.annotateLogs({
                mediaId: request.mediaId,
                ...causeLogAnnotations(cause),
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
        const updatedAt = DateTime.makeUnsafe(new Date(cacheEntry.updatedAt));
        // distance(self, other) = other - self, so the earlier timestamp goes
        // first; the previous order always yielded a negative duration, which
        // meant entries never went stale.
        const staleFor = DateTime.distance(updatedAt, now);

        if (Duration.isGreaterThan(staleFor, ANIDB_CACHE_STALE_AFTER)) {
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
        if (yield* isFreshMiss(request.mediaId, buildAniDbMissTitleKey(request))) {
          yield* Effect.logDebug("AniDB refresh suppressed by fresh miss").pipe(
            Effect.annotateLogs({
              mediaId: request.mediaId,
            }),
          );
          return;
        }

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

export class MediaMetadataEnrichmentService extends Context.Service<
  MediaMetadataEnrichmentService,
  MediaMetadataEnrichmentServiceShape
>()("@bakarr/api/MediaMetadataEnrichmentService") {
  static readonly layer = Layer.effect(
    MediaMetadataEnrichmentService,
    makeMediaMetadataEnrichmentService(),
  );
}

export const MediaMetadataEnrichmentServiceLive = MediaMetadataEnrichmentService.layer;
