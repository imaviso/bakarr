import { Context, Effect, Layer } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import { makeMetadataRefreshRunner } from "@/features/anime/metadata-refresh.ts";

export interface AnimeMetadataRefreshServiceShape {
  readonly refreshMetadataForMonitoredAnime: () => Effect.Effect<
    { refreshed: number },
    DatabaseError | ExternalCallError | AnimeServiceError
  >;
}

export class AnimeMetadataRefreshService extends Context.Tag(
  "@bakarr/api/AnimeMetadataRefreshService",
)<AnimeMetadataRefreshService, AnimeMetadataRefreshServiceShape>() {}

const makeAnimeMetadataRefreshService = Effect.gen(function* () {
  const metadataRefreshRunner = yield* makeMetadataRefreshRunner();

  const refreshMetadataForMonitoredAnime = Effect.fn(
    "AnimeMetadataRefreshService.refreshMetadataForMonitoredAnime",
  )(function* () {
    return yield* metadataRefreshRunner.trigger;
  });

  return { refreshMetadataForMonitoredAnime } satisfies AnimeMetadataRefreshServiceShape;
});

export const AnimeMetadataRefreshServiceLive = Layer.effect(
  AnimeMetadataRefreshService,
  makeAnimeMetadataRefreshService,
);
