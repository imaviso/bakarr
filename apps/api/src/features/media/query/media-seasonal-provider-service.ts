import type { MediaSeason } from "@packages/shared/index.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { ExternalIdMapRepository } from "@/features/media/metadata/external-id-map-repository.ts";
import { TenraiClient } from "@/features/media/metadata/tenrai.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { Context, Effect, Layer } from "effect";
import {
  seasonalWithFallback,
  type MediaSeasonalResult,
} from "@/features/media/metadata/media-metadata-provider-service.ts";

export { type MediaSeasonalResult };

export interface MediaSeasonalProviderServiceShape {
  readonly getSeasonalAnime: (input: {
    season: MediaSeason;
    year: number;
    limit: number;
    page: number;
  }) => Effect.Effect<MediaSeasonalResult, ExternalCallError>;
}

const makeMediaSeasonalProviderService = Effect.fn("MediaSeasonalProviderService.make")(
  function* () {
    const aniList = yield* AniListClient;
    const tenrai = yield* TenraiClient;
    const idMap = yield* ExternalIdMapRepository;

    const getSeasonalAnime = Effect.fn("MediaSeasonalProviderService.getSeasonalAnime")(
      function* (input: { season: MediaSeason; year: number; limit: number; page: number }) {
        return yield* seasonalWithFallback({
          aniList,
          idMap,
          tenrai,
          ...input,
        });
      },
    );

    return { getSeasonalAnime } satisfies MediaSeasonalProviderServiceShape;
  },
);

export class MediaSeasonalProviderService extends Context.Service<
  MediaSeasonalProviderService,
  MediaSeasonalProviderServiceShape
>()("@bakarr/api/MediaSeasonalProviderService") {
  static readonly layer = Layer.effect(
    MediaSeasonalProviderService,
    makeMediaSeasonalProviderService(),
  );
}

export const MediaSeasonalProviderServiceLive = MediaSeasonalProviderService.layer;
