import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { AnimeImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { ImageCacheError } from "@/features/media/metadata/media-image-cache-service.ts";
import type { AnimeMetadata } from "@/features/media/metadata/anilist-model.ts";
import type { AnimeMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import type { AnimeEventPublisher } from "@/features/media/shared/media-orchestration-shared.ts";
import { getAnimeRowEffect } from "@/features/media/shared/media-read-repository.ts";
import {
  encodeAnimeDiscoveryEntries,
  encodeAnimeSynonyms,
} from "@/features/media/metadata/discovery-metadata-codec.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { appendSystemLog } from "@/features/system/support.ts";

export const syncAnimeMetadataEffect = Effect.fn("AnimeMetadataSync.syncAnimeMetadata")(function* <
  E,
>(input: {
  imageCacheService: typeof AnimeImageCacheService.Service;
  metadataProvider: typeof AnimeMetadataProviderService.Service;
  mediaId: number;
  db: AppDatabase;
  eventPublisher: Option.Option<AnimeEventPublisher>;
  nowIso: () => Effect.Effect<string, E>;
}) {
  const { nowIso } = input;
  const animeRow = yield* getAnimeRowEffect(input.db, input.mediaId);
  const metadataLookup = yield* input.metadataProvider.getAnimeMetadataById(input.mediaId);
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
      mediaId: metadataValue.id,
      ...(metadataValue.bannerImage === undefined
        ? {}
        : { bannerImage: metadataValue.bannerImage }),
      ...(metadataValue.coverImage === undefined ? {} : { coverImage: metadataValue.coverImage }),
    })
    .pipe(
      Effect.catchTag("ImageCacheError", (error: ImageCacheError) =>
        Effect.logWarning("Failed to refresh cached media metadata images").pipe(
          Effect.annotateLogs({
            mediaId: input.mediaId,
            error: error.message,
            imageCacheAnimeId: error.mediaId,
          }),
          Effect.as({
            bannerImage: animeRow.bannerImage ?? undefined,
            coverImage: animeRow.coverImage ?? undefined,
          }),
        ),
      ),
    );

  const relatedMedia = yield* encodeAnimeDiscoveryEntries(metadataValue.relatedMedia);
  const recommendedMedia = yield* encodeAnimeDiscoveryEntries(metadataValue.recommendedMedia);
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
    unitCount: metadataValue.unitCount ?? animeRow.unitCount,
    favorites: metadataValue.favorites ?? animeRow.favorites,
    format: metadataValue.format,
    malId: metadataValue.malId ?? animeRow.malId,
    members: metadataValue.members ?? animeRow.members,
    nextAiringAt: metadataValue.nextAiringUnit?.airingAt ?? null,
    nextAiringUnit: metadataValue.nextAiringUnit?.episode ?? null,
    popularity: metadataValue.popularity ?? animeRow.popularity,
    rank: metadataValue.rank ?? animeRow.rank,
    rating: metadataValue.rating ?? animeRow.rating,
    recommendedMedia,
    relatedMedia,
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

  yield* tryDatabasePromise("Failed to update media", () =>
    input.db.update(media).set(nextAnimeRow).where(eq(media.id, input.mediaId)),
  );

  const message = `Refreshed metadata for ${animeRow.titleRomaji}`;
  yield* appendSystemLog(input.db, "media.updated", "success", message, nowIso);

  // Only publish event if publisher is provided
  yield* Option.match(input.eventPublisher, {
    onNone: () => Effect.void,
    onSome: (publisher) => publisher.publishInfo(message),
  });

  return { animeRow, metadata: metadataValue, nextAnimeRow };
});
