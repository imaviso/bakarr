import { Effect, Layer, Option } from "effect";

import { assert, it } from "@effect/vitest";
import { AniListClient } from "@/features/anime/anilist.ts";
import { AnimeMetadataEnrichmentService } from "@/features/anime/anime-metadata-enrichment-service.ts";
import {
  AnimeMetadataProviderService,
  AnimeMetadataProviderServiceLive,
} from "@/features/anime/anime-metadata-provider-service.ts";

it.effect("returns refresh pending when AniDB cache is missing", () => {
  let refreshCount = 0;

  const providerLayer = makeProviderLayer({
    cacheState: { _tag: "Missing" },
    onRefresh: () => {
      refreshCount += 1;
    },
  });

  return Effect.gen(function* () {
    const service = yield* AnimeMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1001);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.enrichment._tag, "Degraded");
      if (result.enrichment._tag === "Degraded") {
        assert.deepStrictEqual(result.enrichment.reason, {
          _tag: "AniDbRefreshPending",
          cacheState: "missing",
        });
      }
    }

    assert.deepStrictEqual(refreshCount, 1);
  }).pipe(Effect.provide(providerLayer));
});

it.effect("returns enriched metadata when AniDB cache is fresh", () => {
  let refreshCount = 0;

  const providerLayer = makeProviderLayer({
    cacheState: {
      _tag: "Fresh",
      episodes: [
        {
          aired: "2024-01-01T00:00:00.000Z",
          number: 1,
          title: "Pilot",
        },
      ],
      updatedAt: "2024-01-02T00:00:00.000Z",
    },
    onRefresh: () => {
      refreshCount += 1;
    },
  });

  return Effect.gen(function* () {
    const service = yield* AnimeMetadataProviderService;
    const result = yield* service.getAnimeMetadataById(1002);

    assert.deepStrictEqual(result._tag, "Found");
    if (result._tag === "Found") {
      assert.deepStrictEqual(result.enrichment, {
        _tag: "Enriched",
        episodes: 1,
        provider: "AniDB",
      });
      assert.deepStrictEqual(result.metadata.episodes?.[0], {
        aired: "2024-01-01T00:00:00.000Z",
        number: 1,
        title: "Pilot",
      });
    }

    assert.deepStrictEqual(refreshCount, 0);
  }).pipe(Effect.provide(providerLayer));
});

function makeProviderLayer(input: {
  readonly cacheState:
    | { readonly _tag: "Missing" }
    | {
        readonly _tag: "Fresh";
        readonly episodes: ReadonlyArray<{
          readonly aired?: string | undefined;
          readonly number: number;
          readonly title?: string | undefined;
        }>;
        readonly updatedAt: string;
      };
  readonly onRefresh: () => void;
}) {
  const dependenciesLayer = Layer.mergeAll(
    Layer.succeed(AniListClient, {
      getAnimeMetadataById: (id: number) => Effect.succeed(Option.some(makeMetadata(id))),
      searchAnimeMetadata: () => Effect.succeed([]),
    }),
    Layer.succeed(AnimeMetadataEnrichmentService, {
      getAniDbCacheState: () => Effect.succeed(input.cacheState),
      requestAniDbRefresh: () => Effect.sync(input.onRefresh),
    }),
  );

  return AnimeMetadataProviderServiceLive.pipe(Layer.provideMerge(dependenciesLayer));
}

function makeMetadata(id: number) {
  return {
    episodeCount: 12,
    format: "TV",
    id,
    status: "RELEASING",
    title: {
      romaji: "Anime",
    },
  };
}
