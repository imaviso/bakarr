import { Layer } from "effect";

import { AnimeFileServiceLive } from "@/features/anime/anime-file-service.ts";
import { AnimeImageCacheServiceLive } from "@/features/anime/anime-image-cache-service.ts";
import { AnimeMaintenanceServiceLive } from "@/features/anime/anime-maintenance-service.ts";
import { AnimeQueryServiceLive } from "@/features/anime/query-service.ts";
import { AnimeSettingsServiceLive } from "@/features/anime/anime-settings-service.ts";
import { AnimeStreamServiceLive } from "@/features/anime/anime-stream-service.ts";
import { StreamTokenSignerLive } from "@/features/anime/stream-token-signer.ts";

export function makeAnimeAppLayer<ROut, E, RIn>(runtimeSupportLayer: Layer.Layer<ROut, E, RIn>) {
  const streamTokenSignerLayer = StreamTokenSignerLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const animeStreamLayer = AnimeStreamServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, streamTokenSignerLayer)),
  );

  return Layer.mergeAll(
    AnimeImageCacheServiceLive,
    AnimeQueryServiceLive,
    AnimeFileServiceLive,
    AnimeMaintenanceServiceLive,
    AnimeSettingsServiceLive,
    streamTokenSignerLayer,
    animeStreamLayer,
  ).pipe(Layer.provideMerge(runtimeSupportLayer));
}
