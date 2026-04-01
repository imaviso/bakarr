import { Layer } from "effect";

import { StreamTokenSignerLive } from "@/http/stream-token-signer.ts";
import { RandomServiceLive } from "@/lib/random.ts";
import { AnimeFileServiceLive } from "@/features/anime/anime-file-service.ts";
import { AnimeMaintenanceServiceLive } from "@/features/anime/anime-maintenance-service.ts";
import { AnimeQueryServiceLive } from "@/features/anime/query-service.ts";
import { AnimeSettingsServiceLive } from "@/features/anime/anime-settings-service.ts";
import { AnimeStreamServiceLive } from "@/features/anime/anime-stream-service.ts";

const streamTokenSignerLayer = StreamTokenSignerLive.pipe(Layer.provide(RandomServiceLive));
const animeStreamLayer = AnimeStreamServiceLive.pipe(Layer.provide(streamTokenSignerLayer));

export const AnimeFeatureLive = Layer.mergeAll(
  AnimeQueryServiceLive,
  AnimeFileServiceLive,
  animeStreamLayer,
  AnimeMaintenanceServiceLive,
  AnimeSettingsServiceLive,
);
