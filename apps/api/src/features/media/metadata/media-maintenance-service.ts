import { Effect, Option } from "effect";
import { brandMediaId } from "@packages/shared/index.ts";

import type { DatabaseError } from "@/db/database.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { syncMediaMetadataEffect } from "@/features/media/metadata/media-metadata-sync.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { AniDbRuntimeConfigError, MediaNotFoundError } from "@/features/media/errors.ts";
import { makeMetadataRefreshRunner } from "@/features/media/metadata/metadata-refresh.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import type { StoredDataError } from "@/features/errors.ts";

export interface MediaMaintenanceServiceShape {
  readonly deleteMedia: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly refreshEpisodes: (
    mediaId: number,
  ) => Effect.Effect<
    void,
    | DatabaseError
    | MediaNotFoundError
    | ExternalCallError
    | StoredDataError
    | AniDbRuntimeConfigError
  >;
  readonly refreshMetadataForMonitoredMedia: () => Effect.Effect<
    { refreshed: number },
    DatabaseError | ExternalCallError
  >;
}

const makeMediaMaintenanceService = Effect.fn("MediaMaintenanceService.make")(function* () {
  const eventBus = yield* EventBus;
  const metadataProvider = yield* MediaMetadataProviderService;
  const imageCacheService = yield* MediaImageCacheService;
  const mediaReadRepository = yield* MediaRepository;
  const mediaUnitRepository = yield* MediaUnitRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const nowIso = currentNowIso;
  const metadataRefreshRunner = yield* makeMetadataRefreshRunner();

  const deleteMedia = Effect.fn("MediaMaintenanceService.deleteMedia")(function* (id: number) {
    yield* mediaReadRepository.deleteMedia(id);
    yield* systemLogRepository.appendLog("media.deleted", "success", `Deleted media ${id}`, nowIso);
  });

  const refreshEpisodes = Effect.fn("MediaMaintenanceService.refreshEpisodes")(function* (
    mediaId: number,
  ) {
    const startAnimeRow = yield* mediaReadRepository.getMediaRow(mediaId);

    yield* eventBus.publish({
      type: "RefreshStarted",
      payload: { media_id: brandMediaId(mediaId), title: startAnimeRow.titleRomaji },
    });

    const { animeRow, metadata, nextAnimeRow } = yield* syncMediaMetadataEffect({
      imageCacheService,
      metadataProvider,
      mediaId,
      eventPublisher: Option.some(eventBus),
      mediaReadRepository,
      systemLogRepository,
      nowIso,
    });

    yield* mediaUnitRepository.syncUnitSchedule(
      mediaId,
      nextAnimeRow,
      metadata?.futureAiringSchedule,
      nowIso,
    );
    yield* mediaUnitRepository.syncUnitMetadata(mediaId, metadata?.mediaUnits);
    yield* systemLogRepository.appendLog(
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

  const refreshMetadataForMonitoredMedia = Effect.fn(
    "MediaMaintenanceService.refreshMetadataForMonitoredMedia",
  )(function* () {
    yield* eventBus.publishInfo("Metadata refresh started");
    const result = yield* metadataRefreshRunner.trigger;
    yield* eventBus.publishInfo(`Metadata refresh finished (${result.refreshed} media)`);
    return result;
  });

  return {
    deleteMedia,
    refreshEpisodes,
    refreshMetadataForMonitoredMedia,
  } satisfies MediaMaintenanceServiceShape;
});

export class MediaMaintenanceService extends Effect.Service<MediaMaintenanceService>()(
  "@bakarr/api/MediaMaintenanceService",
  {
    effect: makeMediaMaintenanceService(),
  },
) {}

export const MediaMaintenanceServiceLive = MediaMaintenanceService.Default;
