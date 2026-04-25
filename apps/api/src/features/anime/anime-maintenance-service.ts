import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import { Database, type DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { AnimeMetadataProviderService } from "@/features/anime/anime-metadata-provider-service.ts";
import { AnimeImageCacheService } from "@/features/anime/anime-image-cache-service.ts";
import { syncEpisodeMetadataEffect } from "@/features/anime/anime-episode-metadata-sync.ts";
import { syncEpisodeScheduleEffect } from "@/features/anime/anime-episode-schedule-sync.ts";
import { syncAnimeMetadataEffect } from "@/features/anime/anime-metadata-sync.ts";
import { getAnimeRowEffect } from "@/features/anime/anime-read-repository.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import { makeMetadataRefreshRunner } from "@/features/anime/metadata-refresh.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";

export interface AnimeMaintenanceServiceShape {
  readonly deleteAnime: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly refreshEpisodes: (
    animeId: number,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly refreshMetadataForMonitoredAnime: () => Effect.Effect<
    { refreshed: number },
    DatabaseError | ExternalCallError | AnimeServiceError
  >;
}

export class AnimeMaintenanceService extends Context.Tag("@bakarr/api/AnimeMaintenanceService")<
  AnimeMaintenanceService,
  AnimeMaintenanceServiceShape
>() {}

const makeAnimeMaintenanceService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const metadataProvider = yield* AnimeMetadataProviderService;
  const imageCacheService = yield* AnimeImageCacheService;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);
  const metadataRefreshRunner = yield* makeMetadataRefreshRunner();

  const deleteAnime = Effect.fn("AnimeMaintenanceService.deleteAnime")(function* (id: number) {
    yield* tryDatabasePromise("Failed to delete anime", () =>
      db.delete(anime).where(eq(anime.id, id)),
    );
    yield* appendSystemLog(db, "anime.deleted", "success", `Deleted anime ${id}`, nowIso);
  });

  const refreshEpisodes = Effect.fn("AnimeMaintenanceService.refreshEpisodes")(function* (
    animeId: number,
  ) {
    const startAnimeRow = yield* getAnimeRowEffect(db, animeId);

    yield* eventBus.publish({
      type: "RefreshStarted",
      payload: { anime_id: animeId, title: startAnimeRow.titleRomaji },
    });

    const { animeRow, metadata, nextAnimeRow } = yield* syncAnimeMetadataEffect({
      imageCacheService,
      metadataProvider,
      animeId,
      db,
      eventPublisher: Option.some(eventBus),
      nowIso,
    });

    yield* syncEpisodeScheduleEffect(
      db,
      animeId,
      nextAnimeRow,
      metadata?.futureAiringSchedule,
      nowIso,
    );
    yield* syncEpisodeMetadataEffect(db, animeId, metadata?.episodes);
    yield* appendSystemLog(
      db,
      "anime.episodes.refreshed",
      "success",
      `Refreshed episodes for ${animeRow.titleRomaji}`,
      nowIso,
    );
    yield* eventBus.publish({
      type: "RefreshFinished",
      payload: { anime_id: animeId, title: animeRow.titleRomaji },
    });
  });

  const refreshMetadataForMonitoredAnime = Effect.fn(
    "AnimeMaintenanceService.refreshMetadataForMonitoredAnime",
  )(function* () {
    yield* eventBus.publishInfo("Metadata refresh started");
    const result = yield* metadataRefreshRunner.trigger;
    yield* eventBus.publishInfo(`Metadata refresh finished (${result.refreshed} anime)`);
    return result;
  });

  return AnimeMaintenanceService.of({
    deleteAnime,
    refreshEpisodes,
    refreshMetadataForMonitoredAnime,
  });
});

export const AnimeMaintenanceServiceLive = Layer.effect(
  AnimeMaintenanceService,
  makeAnimeMaintenanceService,
);
