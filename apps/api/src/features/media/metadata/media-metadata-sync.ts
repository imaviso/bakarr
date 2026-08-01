import { Effect, Option } from "effect";

import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { ImageCacheError } from "@/features/media/metadata/media-image-cache-service.ts";
import type { AnimeMetadata } from "@/features/media/metadata/metadata-model.ts";
import type { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import type { MediaEventPublisher } from "@/features/media/shared/media-orchestration-shared.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import {
  encodeAnimeDiscoveryEntries,
  encodeAnimeSynonyms,
} from "@/features/media/metadata/discovery-metadata-codec.ts";
import { toMediaRowFields } from "@/features/media/shared/media-metadata-row.ts";
import type { SystemLogRepositoryShape } from "@/features/system/repository/log-repository.ts";

export const syncMediaMetadataEffect = Effect.fn("MediaMetadataSync.syncMediaMetadata")(function* <
  E,
>(input: {
  imageCacheService: typeof MediaImageCacheService.Service;
  metadataProvider: typeof MediaMetadataProviderService.Service;
  mediaId: number;
  eventPublisher: Option.Option<MediaEventPublisher>;
  mediaRepository: MediaRepositoryShape;
  systemLogRepository: SystemLogRepositoryShape;
  nowIso: () => Effect.Effect<string, E>;
}) {
  const { nowIso } = input;
  const animeRow = yield* input.mediaRepository.getMediaRow(input.mediaId);
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
    ...toMediaRowFields({
      metadata: metadataValue,
      bannerImage: cachedImages.bannerImage ?? null,
      coverImage: cachedImages.coverImage ?? null,
      previous: animeRow,
    }),
    recommendedMedia,
    relatedMedia,
    synonyms,
  };

  yield* input.mediaRepository.updateMediaRow(input.mediaId, nextAnimeRow);

  const message = `Refreshed metadata for ${animeRow.titleRomaji}`;
  yield* input.systemLogRepository.appendLog("media.updated", "success", message, nowIso);

  yield* Option.match(input.eventPublisher, {
    onNone: () => Effect.void,
    onSome: (publisher) => publisher.publishInfo(message),
  });

  return { animeRow, metadata: metadataValue, nextAnimeRow };
});
