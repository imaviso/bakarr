import { and, eq, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { decideDownloadAction } from "@/features/operations/release-ranking.ts";
import { loadCurrentEpisodeState } from "@/features/operations/repository/anime-repository.ts";
import { loadReleaseRules } from "@/features/operations/repository/profile-repository.ts";
import { loadRuntimeConfig } from "@/features/operations/repository/config-repository.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { BackgroundSearchQualityProfileService } from "@/features/operations/background-search-quality-profile-service.ts";
import { BackgroundSearchQueueService } from "@/features/operations/background-search-queue-service.ts";
import { BackgroundSearchSkipLogService } from "@/features/operations/background-search-skip-log-service.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { OperationsProgress } from "@/features/operations/operations-progress-service.ts";
import { SearchReleaseService } from "@/features/operations/search-orchestration-release-search.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

interface BackgroundSearchMissingSupportInput {
  readonly db: typeof Database.Service.db;
  readonly eventBus: typeof EventBus.Service;
  readonly logSearchMissingSkip: (input: {
    animeId: number;
    episodeNumber: number;
    reason: string;
  }) => Effect.Effect<void, never>;
  readonly nowIso: () => Effect.Effect<string>;
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
  readonly queueReleaseIfEligible: typeof BackgroundSearchQueueService.Service.queueReleaseIfEligible;
  readonly maybeQBitConfig: typeof BackgroundSearchQueueService.Service.maybeQBitConfig;
  readonly requireQualityProfile: typeof BackgroundSearchQualityProfileService.Service.requireQualityProfile;
  readonly searchEpisodeReleases: typeof SearchReleaseService.Service.searchEpisodeReleases;
}

export function makeBackgroundSearchMissingSupport(input: BackgroundSearchMissingSupportInput) {
  const {
    db,
    eventBus,
    nowIso,
    publishDownloadProgress,
    queueReleaseIfEligible,
    maybeQBitConfig,
    requireQualityProfile,
    logSearchMissingSkip,
    searchEpisodeReleases,
  } = input;

  const triggerSearchMissingBase = Effect.fn("operations.search.missing")(function* (
    animeId?: number,
  ) {
    const title = animeId ? (yield* requireAnime(db, animeId)).titleRomaji : "all anime";

    yield* eventBus.publish({
      type: "SearchMissingStarted",
      payload: { anime_id: animeId ?? 0, title },
    });

    const now = yield* nowIso();
    const missingConditions = [
      eq(episodes.downloaded, false),
      sql`${episodes.aired} is not null`,
      sql`${episodes.aired} <= ${now}`,
      animeId ? eq(episodes.animeId, animeId) : eq(anime.monitored, true),
    ];
    const missingRows = yield* tryDatabasePromise("Failed to queue missing-episode search", () =>
      db
        .select()
        .from(episodes)
        .innerJoin(anime, eq(anime.id, episodes.animeId))
        .where(and(...missingConditions)),
    );
    const runtimeConfig = yield* loadRuntimeConfig(db);
    let queued = 0;

    for (const row of missingRows.slice(0, 10)) {
      const profile = yield* requireQualityProfile(row.anime.profileName);

      const rules = yield* loadReleaseRules(db, row.anime);
      const currentEpisode = yield* loadCurrentEpisodeState(db, row.anime.id, row.episodes.number);
      const candidates = yield* searchEpisodeReleases(
        row.anime,
        row.episodes.number,
        runtimeConfig,
      );
      const best = candidates
        .map((item) => ({
          action: decideDownloadAction(profile, rules, currentEpisode, item, runtimeConfig),
          item,
        }))
        .find((entry) => entry.action.Accept || entry.action.Upgrade);

      if (!best) {
        yield* logSearchMissingSkip({
          animeId: row.anime.id,
          episodeNumber: row.episodes.number,
          reason: "no acceptable release candidates",
        });
        continue;
      }

      const queueResult = yield* queueReleaseIfEligible({
        action: best.action,
        animeRow: row.anime,
        contextMessage: "Failed to queue missing-episode search",
        decisionReason:
          best.action.Upgrade?.reason ??
          (best.action.Accept
            ? `Accepted (${best.action.Accept.quality.name}, score ${best.action.Accept.score})`
            : undefined),
        episodeNumber: row.episodes.number,
        eventMessage: `Queued ${best.item.title}`,
        eventType: "download.search_missing.queued",
        item: best.item,
        missingEpisodes: missingRows
          .filter((entry) => entry.anime.id === row.anime.id)
          .map((entry) => entry.episodes.number),
        qbitConfig: maybeQBitConfig(runtimeConfig),
      });

      if (queueResult._tag === "skipped") {
        yield* logSearchMissingSkip({
          animeId: row.anime.id,
          episodeNumber: row.episodes.number,
          reason: "overlapping download already queued",
        });
        continue;
      }

      queued += 1;
    }

    yield* eventBus.publish({
      type: "SearchMissingFinished",
      payload: { anime_id: animeId ?? 0, title, count: queued },
    });
    yield* publishDownloadProgress();
  });

  const triggerSearchMissing = Effect.fn("OperationsService.triggerSearchMissing")(function* (
    animeId?: number,
  ) {
    return yield* triggerSearchMissingBase(animeId).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError
          ? error
          : new OperationsInfrastructureError({
              message: "Failed to queue missing-episode search",
              cause: error,
            }),
      ),
    );
  });

  return {
    triggerSearchMissing,
  };
}

export type SearchBackgroundMissingServiceShape = ReturnType<
  typeof makeBackgroundSearchMissingSupport
>;

export class SearchBackgroundMissingService extends Context.Tag(
  "@bakarr/api/SearchBackgroundMissingService",
)<SearchBackgroundMissingService, SearchBackgroundMissingServiceShape>() {}

export const SearchBackgroundMissingServiceLive = Layer.effect(
  SearchBackgroundMissingService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const clock = yield* ClockService;
    const progress = yield* OperationsProgress;
    const searchReleaseService = yield* SearchReleaseService;
    const queueService = yield* BackgroundSearchQueueService;
    const qualityProfileService = yield* BackgroundSearchQualityProfileService;
    const skipLogService = yield* BackgroundSearchSkipLogService;

    const input: BackgroundSearchMissingSupportInput = {
      db,
      eventBus,
      logSearchMissingSkip: skipLogService.logSearchMissingSkip,
      maybeQBitConfig: queueService.maybeQBitConfig,
      nowIso: () => nowIsoFromClock(clock),
      publishDownloadProgress: progress.publishDownloadProgress,
      queueReleaseIfEligible: queueService.queueReleaseIfEligible,
      requireQualityProfile: qualityProfileService.requireQualityProfile,
      searchEpisodeReleases: searchReleaseService.searchEpisodeReleases,
    };

    return makeBackgroundSearchMissingSupport(input);
  }),
);
