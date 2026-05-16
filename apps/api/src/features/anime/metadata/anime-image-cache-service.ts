import { HttpClient } from "@effect/platform";
import { Context, Effect, Layer, Schema } from "effect";

import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import {
  cacheAnimeMetadataImages,
  type CachedAnimeImages,
} from "@/features/anime/metadata/image-cache.ts";

export class ImageCacheError extends Schema.TaggedError<ImageCacheError>()("ImageCacheError", {
  animeId: Schema.Number,
  cause: Schema.Defect,
  message: Schema.String,
}) {}

export interface AnimeImageCacheServiceShape {
  readonly cacheMetadataImages: (input: {
    readonly animeId: number;
    readonly bannerImage?: string | null;
    readonly coverImage?: string | null;
  }) => Effect.Effect<
    {
      readonly bannerImage?: string;
      readonly coverImage?: string;
    },
    ImageCacheError
  >;
}

interface ImageCacheInput {
  readonly animeId: number;
  readonly bannerImage?: string | null;
  readonly coverImage?: string | null;
}

interface ImageCacheResult {
  readonly bannerImage?: string | undefined;
  readonly coverImage?: string | undefined;
}

export class AnimeImageCacheService extends Context.Tag("@bakarr/api/AnimeImageCacheService")<
  AnimeImageCacheService,
  AnimeImageCacheServiceShape
>() {}

export const AnimeImageCacheServiceLive = Layer.effect(
  AnimeImageCacheService,
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const httpClient = yield* HttpClient.HttpClient;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    const cacheMetadataImages = Effect.fn("AnimeImageCacheService.cacheMetadataImages")(function* (
      input: ImageCacheInput,
    ) {
      const config = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
        Effect.mapError(
          (cause) =>
            new ImageCacheError({
              animeId: input.animeId,
              cause,
              message: "Failed to resolve runtime config for image caching",
            }),
        ),
      );

      const images: CachedAnimeImages = {
        ...(input.bannerImage === undefined ? {} : { bannerImage: input.bannerImage ?? undefined }),
        ...(input.coverImage === undefined ? {} : { coverImage: input.coverImage ?? undefined }),
      };
      const cached = yield* cacheAnimeMetadataImages(
        fs,
        httpClient,
        config.general.images_path,
        input.animeId,
        images,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new ImageCacheError({
              animeId: input.animeId,
              cause,
              message: "Failed to cache anime metadata images",
            }),
        ),
      );

      return {
        ...(cached.bannerImage === undefined ? {} : { bannerImage: cached.bannerImage }),
        ...(cached.coverImage === undefined ? {} : { coverImage: cached.coverImage }),
      } satisfies ImageCacheResult;
    });

    return AnimeImageCacheService.of({ cacheMetadataImages });
  }),
);
