import { Effect } from "effect";

import { encodeNumberList, encodeStringList } from "@/features/system/config-codec.ts";
import type { AppDatabase } from "@/db/database.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import type { EventPublisherShape } from "@/features/events/publisher.ts";
import type { AddAnimeInput } from "@/features/anime/add-anime-input.ts";
import { AnimeImageCacheService } from "@/features/anime/anime-image-cache-service.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import {
  encodeAnimeDiscoveryEntries,
  encodeAnimeSynonyms,
} from "@/features/anime/discovery-metadata-codec.ts";
import { toAnimeDto } from "@/features/anime/dto.ts";
import { AnimePathError } from "@/features/anime/errors.ts";
import { buildMissingEpisodeRows } from "@/features/anime/anime-schedule-repository.ts";
import { insertAnimeAggregateAtomicEffect } from "@/features/anime/aggregate-support.ts";
import { resolveAnimeRootFolderEffect } from "@/features/anime/config-support.ts";
import {
  checkAnimeExistsEffect,
  checkProfileExistsEffect,
  checkRootFolderNotOwnedEffect,
  fetchPersistedEpisodeRowsEffect,
  requireAnimeMetadataEffect,
} from "@/features/anime/anime-add-validation.ts";

export const addAnimeEffect = Effect.fn("AnimeAdd.addAnimeEffect")(function* (input: {
  aniList: typeof AniListClient.Service;
  animeInput: AddAnimeInput;
  db: AppDatabase;
  eventPublisher: Pick<EventPublisherShape, "publishInfo">;
  fs: FileSystemShape;
  imageCacheService: typeof AnimeImageCacheService.Service;
  nowIso: () => Effect.Effect<string>;
}) {
  yield* checkAnimeExistsEffect(input.db, input.animeInput.id);

  const metadata = yield* input.aniList.getAnimeMetadataById(input.animeInput.id);
  const validMetadata = yield* requireAnimeMetadataEffect(metadata);

  yield* checkProfileExistsEffect(input.db, input.animeInput.profile_name);

  const rootFolder = yield* resolveAnimeRootFolderEffect(
    input.db,
    input.animeInput.root_folder,
    validMetadata.title.romaji,
    { useExistingRoot: input.animeInput.use_existing_root },
  );

  yield* checkRootFolderNotOwnedEffect(input.db, rootFolder);

  yield* input.fs.mkdir(rootFolder, { recursive: true }).pipe(
    Effect.mapError(
      () =>
        new AnimePathError({
          message: "Failed to create or access the anime root folder",
        }),
    ),
  );

  const cachedImages = yield* input.imageCacheService
    .cacheMetadataImages({
      animeId: validMetadata.id,
      bannerImage: validMetadata.bannerImage,
      coverImage: validMetadata.coverImage,
    })
    .pipe(
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "Failed to cache anime metadata images",
          operation: "anime.image-cache",
        }),
      ),
    );

  const createdAt = yield* input.nowIso();

  const animeRow = {
    addedAt: createdAt,
    bannerImage: cachedImages.bannerImage ?? null,
    coverImage: cachedImages.coverImage ?? null,
    description: validMetadata.description ?? null,
    endDate: validMetadata.endDate ?? null,
    endYear: validMetadata.endYear ?? null,
    episodeCount: validMetadata.episodeCount ?? null,
    format: validMetadata.format,
    genres: encodeStringList(validMetadata.genres ?? []),
    id: validMetadata.id,
    malId: validMetadata.malId ?? null,
    monitored: input.animeInput.monitored,
    nextAiringAt: validMetadata.nextAiringEpisode?.airingAt ?? null,
    nextAiringEpisode: validMetadata.nextAiringEpisode?.episode ?? null,
    profileName: input.animeInput.profile_name,
    releaseProfileIds: encodeNumberList(input.animeInput.release_profile_ids),
    rootFolder,
    score: validMetadata.score ?? null,
    startDate: validMetadata.startDate ?? null,
    startYear: validMetadata.startYear ?? null,
    status: validMetadata.status,
    studios: encodeStringList(validMetadata.studios ?? []),
    synonyms: encodeAnimeSynonyms(validMetadata.synonyms),
    relatedAnime: encodeAnimeDiscoveryEntries(validMetadata.relatedAnime),
    recommendedAnime: encodeAnimeDiscoveryEntries(validMetadata.recommendedAnime),
    titleEnglish: validMetadata.title.english ?? null,
    titleNative: validMetadata.title.native ?? null,
    titleRomaji: validMetadata.title.romaji,
  };

  const episodeRows = buildMissingEpisodeRows({
    animeId: animeRow.id,
    episodeCount: validMetadata.episodeCount,
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
      eventType: "anime.created",
      level: "success",
      message: `Added ${animeRow.titleRomaji} to library`,
    },
  });

  yield* input.eventPublisher.publishInfo(`Added ${animeRow.titleRomaji} to library`);

  const persistedEpisodeRows = yield* fetchPersistedEpisodeRowsEffect(input.db, animeRow.id);

  return yield* toAnimeDto(animeRow, persistedEpisodeRows);
});
