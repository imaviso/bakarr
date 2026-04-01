import { Layer } from "effect";

import { AnimeMaintenanceServiceLive } from "@/features/anime/anime-maintenance-service.ts";
import { AnimeCreateServiceLive } from "@/features/anime/anime-create-service.ts";
import { AnimeQueryServiceLive } from "@/features/anime/query-service.ts";
import { AnimeSettingsServiceLive } from "@/features/anime/anime-settings-service.ts";

export const AnimeFeatureLive = Layer.mergeAll(
  AnimeQueryServiceLive,
  AnimeCreateServiceLive,
  AnimeMaintenanceServiceLive,
  AnimeSettingsServiceLive,
);
