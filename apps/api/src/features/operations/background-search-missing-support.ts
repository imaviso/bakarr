import { and, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import { decideDownloadAction } from "@/features/operations/release-ranking.ts";
import {
  loadCurrentEpisodeState,
  loadReleaseRules,
  loadRuntimeConfig,
  requireAnime,
} from "@/features/operations/repository.ts";
import { makeBackgroundSearchQueueSupport } from "@/features/operations/background-search-queue-support.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import type {
  BackgroundSearchSupportInput,
  BackgroundSearchSupportShared,
} from "@/features/operations/background-search-support-shared.ts";

export function makeBackgroundSearchMissingSupport(
  input: BackgroundSearchSupportInput,
  shared: BackgroundSearchSupportShared,
) {
  const {
    db,
    eventBus,
    maybeQBitConfig,
    nowIso,
    publishDownloadProgress,
    searchEpisodeReleases,
    tryDatabasePromise,
  } = input;

  const logSearchMissingSkip = shared.logSearchMissingSkip;
  const requireQualityProfile = shared.requireQualityProfile;
  const { queueReleaseIfEligible } = makeBackgroundSearchQueueSupport(input);

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
