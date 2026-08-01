import { Effect } from "effect";

import type { MediaSeason } from "@packages/shared/index.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { JikanClient } from "@/features/media/metadata/jikan.ts";
import { ManamiClient } from "@/features/media/metadata/manami.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
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
    const jikan = yield* JikanClient;
    const manami = yield* ManamiClient;

    const getSeasonalAnime = Effect.fn("MediaSeasonalProviderService.getSeasonalAnime")(
      function* (input: { season: MediaSeason; year: number; limit: number; page: number }) {
        return yield* seasonalWithFallback({
          aniList,
          jikan,
          manami,
          ...input,
        });
      },
    );

    return { getSeasonalAnime } satisfies MediaSeasonalProviderServiceShape;
  },
);

export class MediaSeasonalProviderService extends Effect.Service<MediaSeasonalProviderService>()(
  "@bakarr/api/MediaSeasonalProviderService",
  {
    effect: makeMediaSeasonalProviderService(),
  },
) {}

export const MediaSeasonalProviderServiceLive = MediaSeasonalProviderService.Default;
