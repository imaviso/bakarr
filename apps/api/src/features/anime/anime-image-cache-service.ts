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

    const cacheMetadataImages = Effect.fn("AnimeImageCacheService.cacheMetadataImages")(
      function* (input: {
        readonly animeId: number;
        readonly bannerImage?: string | null;
        readonly coverImage?: string | null;
      }) {
        const config = yield* runtimeConfigSnapshot.getRuntimeConfig();

        return yield* cacheAnimeMetadataImages(
          fs,
          httpClient,
          config.general.images_path,
          input.animeId,
          {
            bannerImage: input.bannerImage ?? undefined,
            coverImage: input.coverImage ?? undefined,
          },
        );
      },
    );

    return AnimeImageCacheService.of({ cacheMetadataImages });
  }),
);
