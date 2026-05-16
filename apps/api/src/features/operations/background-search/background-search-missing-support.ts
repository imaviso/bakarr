import { and, eq, ne, or, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import {
  brandAnimeId,
  type QualityProfile,
  type ReleaseProfileRule,
} from "@packages/shared/index.ts";

import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { backfillEpisodesFromNextAiringEffect } from "@/features/anime/episodes/anime-episode-backfill.ts";
import {
  decideDownloadAction,
  validateQualityProfileSizeLabels,
} from "@/features/operations/search/release-ranking.ts";
import { loadCurrentEpisodeState } from "@/features/anime/shared/anime-read-repository.ts";
import {
  loadQualityProfile,
  loadReleaseRules,
} from "@/features/operations/repository/profile-repository.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/anime/shared/anime-read-repository.ts";
import { BackgroundSearchQueueService } from "@/features/operations/background-search/background-search-queue-service.ts";
import {
  OperationsInfrastructureError,
  OperationsInputError,
} from "@/features/operations/errors.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { SearchReleaseService } from "@/features/operations/search/search-orchestration-release-search.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";

export interface SearchBackgroundMissingServiceShape {
  readonly triggerSearchMissing: (
    animeId?: number,
  ) => Effect.Effect<void, DatabaseError | OperationsInfrastructureError>;
}

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
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
    const nowIso = () => nowIsoFromClock(clock);

    const requireQualityProfile = Effect.fn("BackgroundSearchMissing.requireQualityProfile")(
      function* (profileName: string) {
        const profileOption = yield* loadQualityProfile(db, profileName);

        if (Option.isNone(profileOption)) {
          return yield* new OperationsInputError({
            message: `Quality profile '${profileName}' not found`,
          });
        }

        return profileOption.value;
      },
    );

    const logSearchMissingSkip = Effect.fn("BackgroundSearchMissing.logSearchMissingSkip")(
      function* (input: { animeId: number; episodeNumber: number; reason: string }) {
        yield* Effect.logDebug("Skipping missing-unit background action").pipe(
          Effect.annotateLogs({
            animeId: input.animeId,
            episodeNumber: input.episodeNumber,
            reason: input.reason,
          }),
        );
      },
    );

    const triggerSearchMissingBase = Effect.fn("operations.search.missing")(function* (
      animeId?: number,
    ) {
      yield* backfillEpisodesFromNextAiringEffect({
        ...(animeId === undefined ? {} : { animeId }),
        db,
        monitoredOnly: animeId === undefined,
      });

      const title = animeId ? (yield* requireAnime(db, animeId)).titleRomaji : "all media";

      yield* eventBus.publish({
        type: "SearchMissingStarted",
        payload: {
          ...(animeId === undefined ? {} : { anime_id: brandAnimeId(animeId) }),
          title,
        },
      });

      const now = yield* nowIso();
      const missingConditions = [
        eq(episodes.downloaded, false),
        or(
          and(
            eq(anime.mediaKind, "anime"),
            sql`${episodes.aired} is not null`,
            sql`${episodes.aired} <= ${now}`,
          ),
          ne(anime.mediaKind, "anime"),
        ),
        animeId ? eq(episodes.animeId, animeId) : eq(anime.monitored, true),
      ];
      const missingRows = yield* tryDatabasePromise("Failed to queue missing-unit search", () =>
        db
          .select()
          .from(episodes)
          .innerJoin(anime, eq(anime.id, episodes.animeId))
          .where(and(...missingConditions))
          .orderBy(episodes.aired, anime.titleRomaji)
          .limit(10),
      );
      const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
      let queued = 0;
      const missingEpisodesByAnimeId = new Map<number, number[]>();
      const qualityProfileByName = new Map<string, QualityProfile>();
      const releaseRulesByAnimeId = new Map<number, readonly ReleaseProfileRule[]>();

      for (const row of missingRows) {
        const existing = missingEpisodesByAnimeId.get(row.anime.id);
        if (existing) {
          existing.push(row.episodes.number);
        } else {
          missingEpisodesByAnimeId.set(row.anime.id, [row.episodes.number]);
        }
      }

      for (const row of missingRows) {
        let profile = qualityProfileByName.get(row.anime.profileName);

        if (profile === undefined) {
          const loadedProfile = yield* requireQualityProfile(row.anime.profileName);
          yield* validateQualityProfileSizeLabels(loadedProfile);
          qualityProfileByName.set(row.anime.profileName, loadedProfile);
          profile = loadedProfile;
        }

        let rules = releaseRulesByAnimeId.get(row.anime.id);

        if (rules === undefined) {
          const loadedRules = yield* loadReleaseRules(db, row.anime);
          releaseRulesByAnimeId.set(row.anime.id, loadedRules);
          rules = loadedRules;
        }

        const currentEpisode = yield* loadCurrentEpisodeState(
          db,
          row.anime.id,
          row.episodes.number,
        );
        const candidates = yield* searchReleaseService.searchEpisodeReleases(
          row.anime,
          row.episodes.number,
          runtimeConfig,
        );
        const best = candidates
          .map((item) => ({
            action: decideDownloadAction(profile, rules, currentEpisode, item, runtimeConfig, {
              allowUnknownQuality: row.anime.mediaKind !== "anime",
            }),
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

        const decisionReason =
          best.action.Upgrade?.reason ??
          (best.action.Accept
            ? `Accepted (${best.action.Accept.quality.name}, score ${best.action.Accept.score})`
            : undefined);

        const queueResult = yield* queueService.queueReleaseIfEligible({
          action: best.action,
          animeRow: row.anime,
          contextMessage: "Failed to queue missing-unit search",
          ...(decisionReason === undefined ? {} : { decisionReason }),
          episodeNumber: row.episodes.number,
          eventMessage: `Queued ${best.item.title}`,
          eventType: "download.search_missing.queued",
          item: best.item,
          missingEpisodes: missingEpisodesByAnimeId.get(row.anime.id) ?? [],
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
        payload: {
          ...(animeId === undefined ? {} : { anime_id: brandAnimeId(animeId) }),
          title,
          count: queued,
        },
      });
      yield* progress.publishDownloadProgress();
    });

    const triggerSearchMissing = Effect.fn("OperationsService.triggerSearchMissing")(function* (
      animeId?: number,
    ) {
      return yield* triggerSearchMissingBase(animeId).pipe(
        Effect.mapError((error) =>
          error instanceof DatabaseError
            ? error
            : new OperationsInfrastructureError({
                message: "Failed to queue missing-unit search",
                cause: error,
              }),
        ),
      );
    });

    return SearchBackgroundMissingService.of({ triggerSearchMissing });
  }),
);
