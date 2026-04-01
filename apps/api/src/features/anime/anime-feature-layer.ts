import { Layer } from "effect";

import { AnimeFileServiceLive } from "@/features/anime/anime-file-service.ts";
import { AnimeMaintenanceServiceLive } from "@/features/anime/anime-maintenance-service.ts";
import { AnimeQueryServiceLive } from "@/features/anime/query-service.ts";
import { AnimeSettingsServiceLive } from "@/features/anime/anime-settings-service.ts";
import { AnimeStreamServiceLive } from "@/features/anime/anime-stream-service.ts";

export const AnimeFeatureLive = Layer.mergeAll(
  AnimeQueryServiceLive,
  AnimeFileServiceLive,
  AnimeStreamServiceLive,
  AnimeMaintenanceServiceLive,
  AnimeSettingsServiceLive,
);
