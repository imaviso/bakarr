import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { AnimeImageCacheService } from "@/features/anime/metadata/anime-image-cache-service.ts";
import { ImageCacheError } from "@/features/anime/metadata/anime-image-cache-service.ts";
import type { AnimeMetadata } from "@/features/anime/metadata/anilist-model.ts";
import type { AnimeMetadataProviderService } from "@/features/anime/metadata/anime-metadata-provider-service.ts";
import type { AnimeEventPublisher } from "@/features/anime/shared/anime-orchestration-shared.ts";
import { getAnimeRowEffect } from "@/features/anime/shared/anime-read-repository.ts";
import {
  encodeAnimeDiscoveryEntries,
  encodeAnimeSynonyms,
} from "@/features/anime/metadata/discovery-metadata-codec.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { appendSystemLog } from "@/features/system/support.ts";

export const syncAnimeMetadataEffect = Effect.fn("AnimeMetadataSync.syncAnimeMetadata")(function* <
  E,
>(input: {
  imageCacheService: typeof AnimeImageCacheService.Service;
  metadataProvider: typeof AnimeMetadataProviderService.Service;
  animeId: number;
  db: AppDatabase;
  eventPublisher: Option.Option<AnimeEventPublisher>;
  nowIso: () => Effect.Effect<string, E>;
}) {
  const { nowIso } = input;
  const animeRow = yield* getAnimeRowEffect(input.db, input.animeId);
  const metadataLookup = yield* input.metadataProvider.getAnimeMetadataById(input.animeId);
  const metadata =
    metadataLookup._tag === "NotFound"
      ? Option.none<AnimeMetadata>()
      : Option.some(metadataLookup.metadata);

  if (Option.isNone(metadata)) {
    return { animeRow, metadata: undefined, nextAnimeRow: animeRow };
  }
  const metadataValue = metadata.value;

  const cachedImages = yield* input.imageCacheService
    .cacheMetadataImages({
      animeId: metadataValue.id,
      ...(metadataValue.bannerImage === undefined
        ? {}
        : { bannerImage: metadataValue.bannerImage }),
      ...(metadataValue.coverImage === undefined ? {} : { coverImage: metadataValue.coverImage }),
    })
    .pipe(
      Effect.catchTag("ImageCacheError", (error: ImageCacheError) =>
        Effect.logWarning("Failed to refresh cached anime metadata images").pipe(
          Effect.annotateLogs({
            animeId: input.animeId,
            error: error.message,
            imageCacheAnimeId: error.animeId,
          }),
          Effect.as({
            bannerImage: animeRow.bannerImage ?? undefined,
            coverImage: animeRow.coverImage ?? undefined,
          }),
        ),
      ),
    );

  const relatedAnime = yield* encodeAnimeDiscoveryEntries(metadataValue.relatedAnime);
  const recommendedAnime = yield* encodeAnimeDiscoveryEntries(metadataValue.recommendedAnime);
  const synonyms = yield* encodeAnimeSynonyms(metadataValue.synonyms);

  const nextAnimeRow = {
    ...animeRow,
    background: metadataValue.background ?? animeRow.background,
    bannerImage: cachedImages.bannerImage ?? animeRow.bannerImage,
    coverImage: cachedImages.coverImage ?? animeRow.coverImage,
    description: metadataValue.description ?? animeRow.description,
    duration: metadataValue.duration ?? animeRow.duration,
    endDate: metadataValue.endDate ?? null,
    endYear: metadataValue.endYear ?? null,
    episodeCount: metadataValue.episodeCount ?? animeRow.episodeCount,
    favorites: metadataValue.favorites ?? animeRow.favorites,
    format: metadataValue.format,
    malId: metadataValue.malId ?? animeRow.malId,
    members: metadataValue.members ?? animeRow.members,
    nextAiringAt: metadataValue.nextAiringEpisode?.airingAt ?? null,
    nextAiringEpisode: metadataValue.nextAiringEpisode?.episode ?? null,
    popularity: metadataValue.popularity ?? animeRow.popularity,
    rank: metadataValue.rank ?? animeRow.rank,
    rating: metadataValue.rating ?? animeRow.rating,
    recommendedAnime,
    relatedAnime,
    score: metadataValue.score ?? animeRow.score,
    source: metadataValue.source ?? animeRow.source,
    startDate: metadataValue.startDate ?? null,
    startYear: metadataValue.startYear ?? null,
    status: metadataValue.status,
    synonyms,
    titleEnglish: metadataValue.title.english ?? animeRow.titleEnglish,
    titleNative: metadataValue.title.native ?? animeRow.titleNative,
    titleRomaji: metadataValue.title.romaji,
  };

  yield* tryDatabasePromise("Failed to update anime", () =>
    input.db.update(anime).set(nextAnimeRow).where(eq(anime.id, input.animeId)),
  );

  const message = `Refreshed metadata for ${animeRow.titleRomaji}`;
  yield* appendSystemLog(input.db, "anime.updated", "success", message, nowIso);

  // Only publish event if publisher is provided
  yield* Option.match(input.eventPublisher, {
    onNone: () => Effect.void,
    onSome: (publisher) => publisher.publishInfo(message),
  });

  return { animeRow, metadata: metadataValue, nextAnimeRow };
});
