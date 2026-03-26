import { HttpClient } from "@effect/platform";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { encodeNumberList, encodeStringList } from "../system/config-codec.ts";
import { ProfileNotFoundError } from "../system/errors.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime, episodes } from "../../db/schema.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { EventPublisherShape } from "../events/publisher.ts";
import type { AddAnimeInput } from "./add-anime-input.ts";
import type { AniListClient } from "./anilist.ts";
import { encodeAnimeDiscoveryEntries, encodeAnimeSynonyms } from "./discovery-metadata-codec.ts";
import { toAnimeDto } from "./dto.ts";
import { AnimeConflictError, AnimeNotFoundError, AnimePathError } from "./errors.ts";
import { cacheAnimeMetadataImages } from "./image-cache.ts";
import {
  buildMissingEpisodeRows,
  findAnimeRootFolderOwnerEffect,
  getConfiguredImagesPathEffect,
  insertAnimeAggregateAtomicEffect,
  qualityProfileExistsEffect,
  resolveAnimeRootFolderEffect,
} from "./repository.ts";
import { tryDatabasePromise, wrapAnimeError } from "./service-support.ts";

export const addAnimeEffect = Effect.fn("AnimeService.addAnimeEffect")(function* (input: {
  aniList: typeof AniListClient.Service;
  animeInput: AddAnimeInput;
  db: AppDatabase;
  eventPublisher: Pick<EventPublisherShape, "publishInfo">;
  fs: FileSystemShape;
  httpClient: HttpClient.HttpClient;
  nowIso: () => Effect.Effect<string>;
}) {
  const existing = yield* tryDatabasePromise("Failed to add anime", () =>
    input.db.select({ id: anime.id }).from(anime).where(eq(anime.id, input.animeInput.id)).limit(1),
  );

  if (existing[0]) {
    return yield* new AnimeConflictError({
      message: "Anime already exists",
    });
  }

  const metadata = yield* input.aniList.getAnimeMetadataById(input.animeInput.id);

  if (!metadata) {
    return yield* new AnimeNotFoundError({
      message: "Anime not found",
    });
  }

  const profileExists = yield* qualityProfileExistsEffect(input.db, input.animeInput.profile_name);

  if (!profileExists) {
    return yield* new ProfileNotFoundError({
      message: `Quality profile '${input.animeInput.profile_name}' not found`,
    });
  }

  const rootFolder = yield* resolveAnimeRootFolderEffect(
    input.db,
    input.animeInput.root_folder,
    metadata.title.romaji,
    { useExistingRoot: input.animeInput.use_existing_root },
  ).pipe(Effect.mapError(wrapAnimeError("Failed to add anime")));

  const existingRootOwner = yield* findAnimeRootFolderOwnerEffect(input.db, rootFolder);

  if (existingRootOwner) {
    return yield* new AnimeConflictError({
      message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
    });
  }

  yield* input.fs.mkdir(rootFolder, { recursive: true }).pipe(
    Effect.mapError(
      () =>
        new AnimePathError({
          message: "Failed to create or access the anime root folder",
        }),
    ),
  );

  const imagesPath = yield* getConfiguredImagesPathEffect(input.db).pipe(
    Effect.mapError(wrapAnimeError("Failed to add anime")),
  );
  const cachedImages = yield* cacheAnimeMetadataImages(
    input.fs,
    input.httpClient,
    imagesPath,
    metadata.id,
    {
      bannerImage: metadata.bannerImage,
      coverImage: metadata.coverImage,
    },
  ).pipe(
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
    description: metadata.description ?? null,
    endDate: metadata.endDate ?? null,
    endYear: metadata.endYear ?? null,
    episodeCount: metadata.episodeCount ?? null,
    format: metadata.format,
    genres: encodeStringList(metadata.genres ?? []),
    id: metadata.id,
    malId: metadata.malId ?? null,
    monitored: input.animeInput.monitored,
    nextAiringAt: metadata.nextAiringEpisode?.airingAt ?? null,
    nextAiringEpisode: metadata.nextAiringEpisode?.episode ?? null,
    profileName: input.animeInput.profile_name,
    releaseProfileIds: encodeNumberList(input.animeInput.release_profile_ids),
    rootFolder,
    score: metadata.score ?? null,
    startDate: metadata.startDate ?? null,
    startYear: metadata.startYear ?? null,
    status: metadata.status,
    studios: encodeStringList(metadata.studios ?? []),
    synonyms: encodeAnimeSynonyms(metadata.synonyms),
    relatedAnime: encodeAnimeDiscoveryEntries(metadata.relatedAnime),
    recommendedAnime: encodeAnimeDiscoveryEntries(metadata.recommendedAnime),
    titleEnglish: metadata.title.english ?? null,
    titleNative: metadata.title.native ?? null,
    titleRomaji: metadata.title.romaji,
  };

  const episodeRows = buildMissingEpisodeRows({
    animeId: animeRow.id,
    episodeCount: metadata.episodeCount,
    endDate: metadata.endDate ?? undefined,
    existingRows: [],
    futureAiringSchedule: metadata.futureAiringSchedule,
    nowIso: createdAt,
    resetMissingOnly: true,
    startDate: metadata.startDate ?? undefined,
    status: metadata.status,
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

  const persistedEpisodeRows = yield* tryDatabasePromise("Failed to add anime", () =>
    input.db.select().from(episodes).where(eq(episodes.animeId, animeRow.id)),
  );

  return yield* toAnimeDto(animeRow, persistedEpisodeRows);
});
