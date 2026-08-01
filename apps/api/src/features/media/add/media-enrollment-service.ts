import { Effect, Option } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-service.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { DomainPathError, InfrastructureError, StoredDataError } from "@/features/errors.ts";
import type { AddMediaInput } from "@/features/media/add/add-media-input.ts";
import {
  AniDbRuntimeConfigError,
  MediaConflictError,
  MediaNotFoundError,
} from "@/features/media/errors.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { encodeNumberList, encodeStringList } from "@/features/system/profile-codec.ts";
import {
  encodeAnimeDiscoveryEntries,
  encodeAnimeSynonyms,
} from "@/features/media/metadata/discovery-metadata-codec.ts";
import { toMediaDto, deriveDetailProgress } from "@/features/media/shared/dto.ts";
import { buildMissingEpisodeRows } from "@/features/media/units/media-schedule-repository.ts";
import { resolveMediaRootFolderEffect } from "@/features/media/shared/config-support.ts";
import {
  checkMediaExistsEffect,
  checkProfileExistsEffect,
  checkRootFolderNotOwnedEffect,
  requireMediaMetadataEffect,
} from "@/features/media/add/media-add-validation.ts";
import { mediaKindFromAniListFormat } from "@/features/media/shared/media-kind.ts";

export type MediaEnrollmentError =
  | DatabaseError
  | MediaConflictError
  | MediaNotFoundError
  | ExternalCallError
  | StoredDataError
  | AniDbRuntimeConfigError
  | DomainPathError
  | InfrastructureError;

const makeMediaEnrollmentService = Effect.fn("MediaEnrollmentService.make")(function* () {
  const eventBus = yield* EventBus;
  const metadataProvider = yield* MediaMetadataProviderService;
  const imageCacheService = yield* MediaImageCacheService;
  const fs = yield* FileSystem;
  const mediaRepository = yield* MediaRepository;
  const mediaUnitRepository = yield* MediaUnitRepository;
  const qualityProfileRepository = yield* QualityProfileRepository;
  const systemConfigRepository = yield* SystemConfigRepository;
  const searchBackgroundService = yield* SearchBackgroundMissingService;
  const taskLauncher = yield* OperationsTaskLauncherService;

  const enroll = Effect.fn("MediaEnrollmentService.enroll")(function* (input: AddMediaInput) {
    yield* checkMediaExistsEffect(mediaRepository, input.id);

    const requestedMediaKind = input.media_kind;
    const metadataLookup = yield* metadataProvider.getAnimeMetadataById(
      input.id,
      requestedMediaKind,
    );
    const validMetadata = yield* requireMediaMetadataEffect(
      metadataLookup._tag === "NotFound" ? Option.none() : Option.some(metadataLookup.metadata),
    );
    const mediaKind = requestedMediaKind ?? mediaKindFromAniListFormat(validMetadata.format);

    yield* checkProfileExistsEffect(qualityProfileRepository, input.profile_name);

    const rootFolder = yield* resolveMediaRootFolderEffect(
      systemConfigRepository,
      input.root_folder,
      validMetadata.title.romaji,
      input.use_existing_root === undefined
        ? { mediaKind }
        : { mediaKind, useExistingRoot: input.use_existing_root },
    );

    yield* checkRootFolderNotOwnedEffect(mediaRepository, rootFolder);

    yield* fs.mkdir(rootFolder, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: "Failed to create or access the media root folder",
          }),
      ),
    );

    const cachedImages = yield* imageCacheService
      .cacheMetadataImages({
        mediaId: validMetadata.id,
        ...(validMetadata.bannerImage === undefined
          ? {}
          : { bannerImage: validMetadata.bannerImage }),
        ...(validMetadata.coverImage === undefined ? {} : { coverImage: validMetadata.coverImage }),
      })
      .pipe(
        Effect.mapError((cause) =>
          ExternalCallError.make({
            cause,
            message: "Failed to cache media metadata images",
            operation: "media.image-cache",
          }),
        ),
      );

    const createdAt = yield* currentNowIso();

    const mediaRow = {
      addedAt: createdAt,
      background: validMetadata.background ?? null,
      bannerImage: cachedImages.bannerImage ?? null,
      coverImage: cachedImages.coverImage ?? null,
      description: validMetadata.description ?? null,
      duration: validMetadata.duration ?? null,
      endDate: validMetadata.endDate ?? null,
      endYear: validMetadata.endYear ?? null,
      unitCount: validMetadata.unitCount ?? null,
      favorites: validMetadata.favorites ?? null,
      format: validMetadata.format,
      genres: yield* encodeStringList(validMetadata.genres ?? []).pipe(
        Effect.mapError(
          (cause) =>
            new StoredDataError({
              cause,
              message: "Media genres metadata is invalid",
            }),
        ),
      ),
      id: validMetadata.id,
      malId: validMetadata.malId ?? null,
      mediaKind,
      members: validMetadata.members ?? null,
      monitored: input.monitored,
      nextAiringAt: validMetadata.nextAiringUnit?.airingAt ?? null,
      nextAiringUnit: validMetadata.nextAiringUnit?.episode ?? null,
      popularity: validMetadata.popularity ?? null,
      profileName: input.profile_name,
      rank: validMetadata.rank ?? null,
      rating: validMetadata.rating ?? null,
      releaseProfileIds: yield* encodeNumberList(input.release_profile_ids).pipe(
        Effect.mapError(
          (cause) =>
            new StoredDataError({
              cause,
              message: "Media release profile ids are invalid",
            }),
        ),
      ),
      rootFolder,
      score: validMetadata.score ?? null,
      source: validMetadata.source ?? null,
      startDate: validMetadata.startDate ?? null,
      startYear: validMetadata.startYear ?? null,
      status: validMetadata.status,
      studios: yield* encodeStringList(validMetadata.studios ?? []).pipe(
        Effect.mapError(
          (cause) =>
            new StoredDataError({
              cause,
              message: "Media studios metadata is invalid",
            }),
        ),
      ),
      synonyms: yield* encodeAnimeSynonyms(validMetadata.synonyms),
      relatedMedia: yield* encodeAnimeDiscoveryEntries(validMetadata.relatedMedia),
      recommendedMedia: yield* encodeAnimeDiscoveryEntries(validMetadata.recommendedMedia),
      titleEnglish: validMetadata.title.english ?? null,
      titleNative: validMetadata.title.native ?? null,
      titleRomaji: validMetadata.title.romaji,
    };

    const unitRows = buildMissingEpisodeRows({
      mediaId: mediaRow.id,
      unitCount: validMetadata.unitCount,
      endDate: validMetadata.endDate ?? undefined,
      existingRows: [],
      futureAiringSchedule: validMetadata.futureAiringSchedule,
      nowIso: createdAt,
      resetMissingOnly: true,
      startDate: validMetadata.startDate ?? undefined,
      status: validMetadata.status,
    });

    yield* mediaRepository.insertMediaAggregate({
      mediaRow,
      unitRows,
      log: {
        createdAt,
        details: null,
        eventType: "media.created",
        level: "success",
        message: `Added ${mediaRow.titleRomaji} to library`,
      },
    });

    yield* mediaUnitRepository.syncUnitMetadata(mediaRow.id, validMetadata.mediaUnits);

    yield* eventBus.publish({
      type: "Info",
      payload: { message: `Added ${mediaRow.titleRomaji} to library` },
    });

    const persistedEpisodeRows = yield* mediaRepository.listUnitRowsByMediaId(mediaRow.id);
    const media = yield* toMediaDto(
      mediaRow,
      deriveDetailProgress(persistedEpisodeRows, mediaRow.unitCount ?? undefined),
    );

    if (input.monitor_and_search) {
      yield* taskLauncher.launch({
        mediaId: media.id,
        failureMessage: `Post-enrollment missing-unit search failed for media ${media.id}`,
        operation: () => searchBackgroundService.triggerSearchMissing(media.id),
        queuedMessage: `Queued post-enrollment missing-unit search for media ${media.id}`,
        runningMessage: `Searching missing mediaUnits for media ${media.id}`,
        successMessage: () => `Finished post-enrollment missing-unit search for media ${media.id}`,
        taskKey: "downloads_search_missing_manual",
      });
    }

    return media;
  });

  return { enroll };
});

export class MediaEnrollmentService extends Effect.Service<MediaEnrollmentService>()(
  "@bakarr/api/MediaEnrollmentService",
  {
    // Filesystem + RuntimeConfigSnapshotService come from the lifecycle layer.
    dependencies: [
      EventBus.Default,
      MediaImageCacheService.Default,
      MediaMetadataProviderService.Default,
      MediaRepository.Default,
      MediaUnitRepository.Default,
      OperationsTaskLauncherService.Default,
      QualityProfileRepository.Default,
      SearchBackgroundMissingService.Default,
      SystemConfigRepository.Default,
    ],
    effect: makeMediaEnrollmentService(),
  },
) {}

export const MediaEnrollmentServiceLive = MediaEnrollmentService.Default;
