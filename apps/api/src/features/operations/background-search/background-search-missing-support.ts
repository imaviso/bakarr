import { and, eq, ne, or, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import {
  brandMediaId,
  type QualityProfile,
  type ReleaseProfileRule,
} from "@packages/shared/index.ts";

import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { backfillEpisodesFromNextAiringEffect } from "@/features/media/units/media-unit-backfill.ts";
import {
  decideDownloadAction,
  validateQualityProfileSizeLabels,
} from "@/features/operations/search/release-ranking.ts";
import { loadCurrentEpisodeState } from "@/features/media/shared/media-read-repository.ts";
import {
  loadQualityProfile,
  loadReleaseRules,
} from "@/features/operations/repository/profile-repository.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/media/shared/media-read-repository.ts";
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
    mediaId?: number,
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
      function* (input: { mediaId: number; unitNumber: number; reason: string }) {
        yield* Effect.logDebug("Skipping missing-unit background action").pipe(
          Effect.annotateLogs({
            mediaId: input.mediaId,
            unitNumber: input.unitNumber,
            reason: input.reason,
          }),
        );
      },
    );

    const triggerSearchMissingBase = Effect.fn("operations.search.missing")(function* (
      mediaId?: number,
    ) {
      yield* backfillEpisodesFromNextAiringEffect({
        ...(mediaId === undefined ? {} : { mediaId }),
        db,
        monitoredOnly: mediaId === undefined,
      });

      const title = mediaId ? (yield* requireAnime(db, mediaId)).titleRomaji : "all media";

      yield* eventBus.publish({
        type: "SearchMissingStarted",
        payload: {
          ...(mediaId === undefined ? {} : { media_id: brandMediaId(mediaId) }),
          title,
        },
      });

      const now = yield* nowIso();
      const missingConditions = [
        eq(mediaUnits.downloaded, false),
        or(
          and(
            eq(media.mediaKind, "anime"),
            sql`${mediaUnits.aired} is not null`,
            sql`${mediaUnits.aired} <= ${now}`,
          ),
          and(
            ne(media.mediaKind, "anime"),
            or(sql`${mediaUnits.aired} is null`, sql`${mediaUnits.aired} <= ${now}`),
          ),
        ),
        mediaId ? eq(mediaUnits.mediaId, mediaId) : eq(media.monitored, true),
      ];
      const missingRows = yield* tryDatabasePromise("Failed to queue missing-unit search", () =>
        db
          .select()
          .from(mediaUnits)
          .innerJoin(media, eq(media.id, mediaUnits.mediaId))
          .where(and(...missingConditions))
          .orderBy(media.titleRomaji, mediaUnits.number)
          .limit(10),
      );
      const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
      let queued = 0;
      const missingEpisodesByAnimeId = new Map<number, number[]>();
      const qualityProfileByName = new Map<string, QualityProfile>();
      const releaseRulesByAnimeId = new Map<number, readonly ReleaseProfileRule[]>();

      for (const row of missingRows) {
        const existing = missingEpisodesByAnimeId.get(row.media.id);
        if (existing) {
          existing.push(row.media_units.number);
        } else {
          missingEpisodesByAnimeId.set(row.media.id, [row.media_units.number]);
        }
      }

      for (const row of missingRows) {
        let profile = qualityProfileByName.get(row.media.profileName);

        if (profile === undefined) {
          const loadedProfile = yield* requireQualityProfile(row.media.profileName);
          yield* validateQualityProfileSizeLabels(loadedProfile);
          qualityProfileByName.set(row.media.profileName, loadedProfile);
          profile = loadedProfile;
        }

        let rules = releaseRulesByAnimeId.get(row.media.id);

        if (rules === undefined) {
          const loadedRules = yield* loadReleaseRules(db, row.media);
          releaseRulesByAnimeId.set(row.media.id, loadedRules);
          rules = loadedRules;
        }

        const currentEpisode = yield* loadCurrentEpisodeState(
          db,
          row.media.id,
          row.media_units.number,
        );
        const candidates = yield* searchReleaseService.searchUnitReleases(
          row.media,
          row.media_units.number,
          runtimeConfig,
        );
        const best = candidates
          .map((item) => ({
            action: decideDownloadAction(profile, rules, currentEpisode, item, runtimeConfig, {
              allowUnknownQuality: row.media.mediaKind !== "anime",
            }),
            item,
          }))
          .find((entry) => entry.action.Accept || entry.action.Upgrade);

        if (!best) {
          yield* logSearchMissingSkip({
            mediaId: row.media.id,
            unitNumber: row.media_units.number,
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
          animeRow: row.media,
          contextMessage: "Failed to queue missing-unit search",
          ...(decisionReason === undefined ? {} : { decisionReason }),
          unitNumber: row.media_units.number,
          eventMessage: `Queued ${best.item.title}`,
          eventType: "download.search_missing.queued",
          item: best.item,
          missingUnits: missingEpisodesByAnimeId.get(row.media.id) ?? [],
        });

        if (queueResult._tag === "skipped") {
          yield* logSearchMissingSkip({
            mediaId: row.media.id,
            unitNumber: row.media_units.number,
            reason: "overlapping download already queued",
          });
          continue;
        }

        queued += 1;
      }

      yield* eventBus.publish({
        type: "SearchMissingFinished",
        payload: {
          ...(mediaId === undefined ? {} : { media_id: brandMediaId(mediaId) }),
          title,
          count: queued,
        },
      });
      yield* progress.publishDownloadProgress();
    });

    const triggerSearchMissing = Effect.fn("OperationsService.triggerSearchMissing")(function* (
      mediaId?: number,
    ) {
      return yield* triggerSearchMissingBase(mediaId).pipe(
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
