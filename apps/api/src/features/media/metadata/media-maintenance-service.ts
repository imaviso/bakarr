import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";
import { brandMediaId } from "@packages/shared/index.ts";

import { Database, type DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { AnimeMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { AnimeImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { syncEpisodeMetadataEffect } from "@/features/media/units/media-unit-metadata-sync.ts";
import { syncEpisodeScheduleEffect } from "@/features/media/units/media-unit-schedule-sync.ts";
import { syncAnimeMetadataEffect } from "@/features/media/metadata/media-metadata-sync.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import type { MediaServiceError } from "@/features/media/errors.ts";
import { makeMetadataRefreshRunner } from "@/features/media/metadata/metadata-refresh.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";

export interface AnimeMaintenanceServiceShape {
  readonly deleteMedia: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly refreshEpisodes: (
    mediaId: number,
  ) => Effect.Effect<void, MediaServiceError | DatabaseError>;
  readonly refreshMetadataForMonitoredAnime: () => Effect.Effect<
    { refreshed: number },
    DatabaseError | ExternalCallError | MediaServiceError
  >;
}

const makeAnimeMaintenanceService = Effect.fn("AnimeMaintenanceService.make")(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const metadataProvider = yield* AnimeMetadataProviderService;
  const imageCacheService = yield* AnimeImageCacheService;
  const mediaReadRepository = yield* MediaReadRepository;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);
  const metadataRefreshRunner = yield* makeMetadataRefreshRunner();

  const deleteMedia = Effect.fn("AnimeMaintenanceService.deleteMedia")(function* (id: number) {
    yield* tryDatabasePromise("Failed to delete media", () =>
      db.delete(media).where(eq(media.id, id)),
    );
    yield* appendSystemLog(db, "media.deleted", "success", `Deleted media ${id}`, nowIso);
  });

  const refreshEpisodes = Effect.fn("AnimeMaintenanceService.refreshEpisodes")(function* (
    mediaId: number,
  ) {
    const startAnimeRow = yield* mediaReadRepository.getAnimeRow(mediaId);

    yield* eventBus.publish({
      type: "RefreshStarted",
      payload: { media_id: brandMediaId(mediaId), title: startAnimeRow.titleRomaji },
    });

    const { animeRow, metadata, nextAnimeRow } = yield* syncAnimeMetadataEffect({
      imageCacheService,
      metadataProvider,
      mediaId,
      db,
      eventPublisher: Option.some(eventBus),
      mediaReadRepository,
      nowIso,
    });

    yield* syncEpisodeScheduleEffect(
      db,
      mediaId,
      nextAnimeRow,
      metadata?.futureAiringSchedule,
      nowIso,
    );
    yield* syncEpisodeMetadataEffect(db, mediaId, metadata?.mediaUnits);
    yield* appendSystemLog(
      db,
      "media.mediaUnits.refreshed",
      "success",
      `Refreshed mediaUnits for ${animeRow.titleRomaji}`,
      nowIso,
    );
    yield* eventBus.publish({
      type: "RefreshFinished",
      payload: { media_id: brandMediaId(mediaId), title: animeRow.titleRomaji },
    });
  });

  const refreshMetadataForMonitoredAnime = Effect.fn(
    "AnimeMaintenanceService.refreshMetadataForMonitoredAnime",
  )(function* () {
    yield* eventBus.publishInfo("Metadata refresh started");
    const result = yield* metadataRefreshRunner.trigger;
    yield* eventBus.publishInfo(`Metadata refresh finished (${result.refreshed} media)`);
    return result;
  });

  return {
    deleteMedia,
    refreshEpisodes,
    refreshMetadataForMonitoredAnime,
  } satisfies AnimeMaintenanceServiceShape;
});

export class AnimeMaintenanceService extends Effect.Service<AnimeMaintenanceService>()(
  "@bakarr/api/AnimeMaintenanceService",
  {
    effect: makeAnimeMaintenanceService(),
  },
) {}

export const AnimeMaintenanceServiceLive = AnimeMaintenanceService.Default;
