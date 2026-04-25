import { and, count, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { Anime, AnimeListQueryParams, AnimeListResponse } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import { AnimeStoredDataError } from "@/features/anime/errors.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { deriveAnimeSeason, extractYearFromDate } from "@/domain/anime/date-utils.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredNumberListEffect,
  decodeStoredStringListEffect,
} from "@/features/anime/decode-support.ts";

interface EpisodeStats {
  readonly downloaded: number;
  readonly latestDownloadedEpisode?: number;
}

export const listAnimeEffect = Effect.fn("AnimeQueryList.listAnimeEffect")(function* (
  db: AppDatabase,
  params: AnimeListQueryParams = {},
) {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);

  const monitoredCondition =
    params.monitored !== undefined ? eq(anime.monitored, params.monitored) : undefined;

  const [animeRows, totalCountResult] = yield* Effect.all([
    tryDatabasePromise("Failed to list anime", () => {
      const baseQuery = db.select().from(anime);
      const query = monitoredCondition ? baseQuery.where(monitoredCondition) : baseQuery;
      return query.orderBy(anime.id).limit(limit).offset(offset);
    }),
    tryDatabasePromise("Failed to count anime", () => {
      const countQuery = db.select({ count: count() }).from(anime);
      return monitoredCondition ? countQuery.where(monitoredCondition) : countQuery;
    }),
  ]);

  const animeIds = animeRows.map((row) => row.id);
  const episodeStatsByAnimeId = new Map<number, EpisodeStats>();

  if (animeIds.length > 0) {
    const episodeStats = yield* tryDatabasePromise("Failed to list anime", () =>
      db
        .select({
          animeId: episodes.animeId,
          downloadedCount: sql<number>`coalesce(sum(case when ${episodes.downloaded} then 1 else 0 end), 0)`,
          latestDownloadedEpisode: sql<
            number | null
          >`max(case when ${episodes.downloaded} then ${episodes.number} else null end)`,
        })
        .from(episodes)
        .where(inArray(episodes.animeId, animeIds))
        .groupBy(episodes.animeId),
    );

    for (const stat of episodeStats) {
      const latestDownloadedEpisode =
        stat.latestDownloadedEpisode === null ? undefined : stat.latestDownloadedEpisode;

      episodeStatsByAnimeId.set(stat.animeId, {
        downloaded: stat.downloadedCount ?? 0,
        ...(latestDownloadedEpisode === undefined ? {} : { latestDownloadedEpisode }),
      });
    }
  }

  const airedEpisodeRows =
    animeIds.length === 0
      ? []
      : yield* tryDatabasePromise("Failed to list anime", () =>
          db
            .select({
              animeId: episodes.animeId,
              number: episodes.number,
            })
            .from(episodes)
            .where(and(inArray(episodes.animeId, animeIds), eq(episodes.downloaded, false))),
        );

  const missingNumbersByAnimeId = new Map<number, number[]>();
  for (const row of airedEpisodeRows) {
    const existing = missingNumbersByAnimeId.get(row.animeId);
    if (existing) {
      existing.push(row.number);
    } else {
      missingNumbersByAnimeId.set(row.animeId, [row.number]);
    }
  }

  const animeProgressRows = yield* Effect.forEach(animeRows, (row) =>
    toAnimeDtoProgress(row, episodeStatsByAnimeId.get(row.id), missingNumbersByAnimeId.get(row.id)),
  );

  const total = totalCountResult[0]?.count;

  if (total === undefined) {
    return yield* Effect.dieMessage("Anime count query returned no rows");
  }

  return {
    has_more: offset + limit < total,
    items: animeProgressRows,
    limit,
    offset,
    total,
  } satisfies AnimeListResponse;
});

function toAnimeDtoProgress(
  row: typeof anime.$inferSelect,
  progress?: EpisodeStats,
  missingNumbers: readonly number[] = [],
): Effect.Effect<Anime, AnimeStoredDataError> {
  const downloaded = progress?.downloaded ?? 0;
  const total = row.episodeCount ?? undefined;
  const sortedMissing = total
    ? [...missingNumbers]
        .filter((number) => number >= 1 && number <= total)
        .toSorted((left, right) => left - right)
    : [];
  const downloadedPercent =
    total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined;
  const latestDownloadedEpisode = progress?.latestDownloadedEpisode;

  return Effect.gen(function* () {
    const genres = yield* decodeStoredStringListEffect(row.genres, "genres").pipe(
      Effect.map((value) => value ?? []),
    );
    const recommendedAnime = yield* decodeStoredDiscoveryEntriesEffect(
      row.recommendedAnime,
      "recommendedAnime",
    );
    const relatedAnime = yield* decodeStoredDiscoveryEntriesEffect(
      row.relatedAnime,
      "relatedAnime",
    );
    const releaseProfileIds = yield* decodeStoredNumberListEffect(
      row.releaseProfileIds,
      "releaseProfileIds",
    );
    const studios = yield* decodeStoredStringListEffect(row.studios, "studios").pipe(
      Effect.map((value) => value ?? []),
    );
    const synonyms = yield* decodeStoredStringListEffect(row.synonyms, "synonyms");

    return {
      added_at: row.addedAt,
      background: row.background ?? undefined,
      banner_image: row.bannerImage ?? undefined,
      cover_image: row.coverImage ?? undefined,
      description: row.description ?? undefined,
      duration: row.duration ?? undefined,
      end_date: row.endDate ?? undefined,
      end_year: row.endYear ?? undefined,
      episode_count: row.episodeCount ?? undefined,
      favorites: row.favorites ?? undefined,
      format: row.format,
      genres,
      id: row.id,
      mal_id: row.malId ?? undefined,
      members: row.members ?? undefined,
      monitored: row.monitored,
      popularity: row.popularity ?? undefined,
      next_airing_episode:
        row.nextAiringAt && row.nextAiringEpisode
          ? {
              airing_at: row.nextAiringAt,
              episode: row.nextAiringEpisode,
            }
          : undefined,
      score: row.score ?? undefined,
      profile_name: row.profileName,
      progress: {
        downloaded,
        downloaded_percent: downloadedPercent,
        is_up_to_date: total ? sortedMissing.length === 0 : undefined,
        latest_downloaded_episode: latestDownloadedEpisode,
        missing: sortedMissing,
        next_missing_episode: sortedMissing[0],
        total,
      },
      recommended_anime: recommendedAnime,
      related_anime: relatedAnime,
      release_profile_ids: releaseProfileIds,
      root_folder: row.rootFolder,
      rank: row.rank ?? undefined,
      rating: row.rating ?? undefined,
      season: deriveAnimeSeason(row.startDate ?? undefined),
      season_year: row.startYear ?? extractYearFromDate(row.startDate),
      source: row.source ?? undefined,
      start_date: row.startDate ?? undefined,
      start_year: row.startYear ?? undefined,
      status: row.status,
      studios,
      synonyms,
      title: {
        english: row.titleEnglish ?? undefined,
        native: row.titleNative ?? undefined,
        romaji: row.titleRomaji,
      },
    } satisfies Anime;
  });
}
