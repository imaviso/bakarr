import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { ImageCacheError } from "@/features/media/metadata/media-image-cache-service.ts";
import type { AnimeMetadata } from "@/features/media/metadata/metadata-model.ts";
import type { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import type { EventBusShape } from "@/infra/effect/event-bus.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import {
  encodeAnimeDiscoveryEntries,
  encodeAnimeSynonyms,
} from "@/features/media/metadata/discovery-metadata-codec.ts";
import { toMediaRowFields } from "@/features/media/shared/media-metadata-row.ts";
import type { SystemLogRepositoryShape } from "@/features/system/repository/log-repository.ts";
import { Effect, Option } from "effect";

type MediaEventPublisher = Pick<EventBusShape, "publish" | "publishInfo">;

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
  const mediaRow = yield* input.mediaRepository.getMediaRow(input.mediaId);
  const metadataLookup = yield* input.metadataProvider.getAnimeMetadataById(input.mediaId);
  const metadata =
    metadataLookup._tag === "NotFound"
      ? Option.none<AnimeMetadata>()
      : Option.some(metadataLookup.metadata);

  if (Option.isNone(metadata)) {
    return { mediaRow, metadata: undefined, nextMediaRow: mediaRow };
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
            bannerImage: mediaRow.bannerImage ?? undefined,
            coverImage: mediaRow.coverImage ?? undefined,
          }),
        ),
      ),
    );

  const relatedMedia = yield* encodeAnimeDiscoveryEntries(metadataValue.relatedMedia);
  const recommendedMedia = yield* encodeAnimeDiscoveryEntries(metadataValue.recommendedMedia);
  const synonyms = yield* encodeAnimeSynonyms(metadataValue.synonyms);

  const nextMediaRow = {
    ...mediaRow,
    ...toMediaRowFields({
      metadata: metadataValue,
      bannerImage: cachedImages.bannerImage ?? null,
      coverImage: cachedImages.coverImage ?? null,
      previous: mediaRow,
    }),
    recommendedMedia,
    relatedMedia,
    synonyms,
  };

  yield* input.mediaRepository.updateMediaRow(input.mediaId, nextMediaRow);

  const message = `Refreshed metadata for ${mediaRow.titleRomaji}`;
  yield* input.systemLogRepository.appendLog("media.updated", "success", message, nowIso);

  yield* Option.match(input.eventPublisher, {
    onNone: () => Effect.void,
    onSome: (publisher) => publisher.publishInfo(message),
  });

  return { mediaRow, metadata: metadataValue, nextMediaRow };
});
