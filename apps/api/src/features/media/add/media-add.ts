import { Effect, Option } from "effect";

import { encodeNumberList, encodeStringList } from "@/features/profiles/profile-codec.ts";
import type { AppDatabase } from "@/db/database.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { EventBusShape } from "@/features/events/event-bus.ts";
import type { AddAnimeInput } from "@/features/media/add/add-media-input.ts";
import { AnimeImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import type { AnimeMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import {
  encodeAnimeDiscoveryEntries,
  encodeAnimeSynonyms,
} from "@/features/media/metadata/discovery-metadata-codec.ts";
import { toAnimeDto } from "@/features/media/shared/dto.ts";
import { MediaPathError, MediaStoredDataError } from "@/features/media/errors.ts";
import { buildMissingEpisodeRows } from "@/features/media/units/media-schedule-repository.ts";
import { insertAnimeAggregateAtomicEffect } from "@/features/media/shared/aggregate-support.ts";
import { resolveAnimeRootFolderEffect } from "@/features/media/shared/config-support.ts";
import { syncEpisodeMetadataEffect } from "@/features/media/units/media-unit-metadata-sync.ts";
import {
  checkAnimeExistsEffect,
  checkProfileExistsEffect,
  checkRootFolderNotOwnedEffect,
  fetchPersistedEpisodeRowsEffect,
  requireAnimeMetadataEffect,
} from "@/features/media/add/media-add-validation.ts";

export const addAnimeEffect = Effect.fn("AnimeAdd.addAnimeEffect")(function* (input: {
  metadataProvider: typeof AnimeMetadataProviderService.Service;
  animeInput: AddAnimeInput;
  db: AppDatabase;
  eventPublisher: Pick<EventBusShape, "publish">;
  fs: FileSystemShape;
  imageCacheService: typeof AnimeImageCacheService.Service;
  nowIso: () => Effect.Effect<string>;
}) {
  yield* checkAnimeExistsEffect(input.db, input.animeInput.id);

  const mediaKind = input.animeInput.media_kind ?? "anime";
  const metadataLookup = yield* input.metadataProvider.getAnimeMetadataById(
    input.animeInput.id,
    mediaKind,
  );
  const validMetadata = yield* requireAnimeMetadataEffect(
    metadataLookup._tag === "NotFound" ? Option.none() : Option.some(metadataLookup.metadata),
  );

  yield* checkProfileExistsEffect(input.db, input.animeInput.profile_name);

  const rootFolder = yield* resolveAnimeRootFolderEffect(
    input.db,
    input.animeInput.root_folder,
    validMetadata.title.romaji,
    input.animeInput.use_existing_root === undefined
      ? {}
      : { useExistingRoot: input.animeInput.use_existing_root },
  );

  yield* checkRootFolderNotOwnedEffect(input.db, rootFolder);

  yield* input.fs.mkdir(rootFolder, { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new MediaPathError({
          cause,
          message: "Failed to create or access the media root folder",
        }),
    ),
  );

  const cachedImages = yield* input.imageCacheService
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

  const createdAt = yield* input.nowIso();

  const animeRow = {
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
          new MediaStoredDataError({
            cause,
            message: "Media genres metadata is invalid",
          }),
      ),
    ),
    id: validMetadata.id,
    malId: validMetadata.malId ?? null,
    mediaKind,
    members: validMetadata.members ?? null,
    monitored: input.animeInput.monitored,
    nextAiringAt: validMetadata.nextAiringUnit?.airingAt ?? null,
    nextAiringUnit: validMetadata.nextAiringUnit?.episode ?? null,
    popularity: validMetadata.popularity ?? null,
    profileName: input.animeInput.profile_name,
    rank: validMetadata.rank ?? null,
    rating: validMetadata.rating ?? null,
    releaseProfileIds: yield* encodeNumberList(input.animeInput.release_profile_ids).pipe(
      Effect.mapError(
        (cause) =>
          new MediaStoredDataError({
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
          new MediaStoredDataError({
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

  const episodeRows = buildMissingEpisodeRows({
    mediaId: animeRow.id,
    unitCount: validMetadata.unitCount,
    endDate: validMetadata.endDate ?? undefined,
    existingRows: [],
    futureAiringSchedule: validMetadata.futureAiringSchedule,
    nowIso: createdAt,
    resetMissingOnly: true,
    startDate: validMetadata.startDate ?? undefined,
    status: validMetadata.status,
  });

  yield* insertAnimeAggregateAtomicEffect(input.db, {
    animeRow,
    episodeRows,
    log: {
      createdAt,
      details: null,
      eventType: "media.created",
      level: "success",
      message: `Added ${animeRow.titleRomaji} to library`,
    },
  });

  yield* syncEpisodeMetadataEffect(input.db, animeRow.id, validMetadata.mediaUnits);

  yield* input.eventPublisher.publish({
    type: "Info",
    payload: { message: `Added ${animeRow.titleRomaji} to library` },
  });

  const persistedEpisodeRows = yield* fetchPersistedEpisodeRowsEffect(input.db, animeRow.id);

  return yield* toAnimeDto(animeRow, persistedEpisodeRows);
});
