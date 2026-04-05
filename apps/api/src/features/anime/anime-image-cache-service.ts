import { HttpClient } from "@effect/platform";
import { Context, Effect, Layer } from "effect";

import { FileSystem } from "@/lib/filesystem.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { cacheAnimeMetadataImages } from "@/features/anime/image-cache.ts";

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
    unknown
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
      const config = yield* runtimeConfigSnapshot.getRuntimeConfig();

      const images: import("@/features/anime/image-cache.ts").CachedAnimeImages = {
        ...(input.bannerImage === undefined ? {} : { bannerImage: input.bannerImage ?? undefined }),
        ...(input.coverImage === undefined ? {} : { coverImage: input.coverImage ?? undefined }),
      };
      const cached = yield* cacheAnimeMetadataImages(
        fs,
        httpClient,
        config.general.images_path,
        input.animeId,
        images,
      );

      return {
        ...(cached.bannerImage === undefined ? {} : { bannerImage: cached.bannerImage }),
        ...(cached.coverImage === undefined ? {} : { coverImage: cached.coverImage }),
      } satisfies ImageCacheResult;
    });

    return AnimeImageCacheService.of({ cacheMetadataImages });
  }),
);
