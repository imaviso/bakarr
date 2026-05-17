import { and, count, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import {
  brandMediaId,
  brandReleaseProfileId,
  type Media,
  type MediaListQueryParams,
  type MediaListResponse,
} from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { MediaStoredDataError } from "@/features/media/errors.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { deriveAnimeSeason, extractYearFromDate } from "@/domain/media/date-utils.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredNumberListEffect,
  decodeStoredStringListEffect,
} from "@/features/media/shared/decode-support.ts";
import { decodeMediaKind } from "@/features/media/shared/media-kind.ts";

interface EpisodeStats {
  readonly downloaded: number;
  readonly latestDownloadedUnit?: number;
}

export const listAnimeEffect = Effect.fn("AnimeQueryList.listAnimeEffect")(function* (
  db: AppDatabase,
  params: MediaListQueryParams = {},
) {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);

  const monitoredCondition =
    params.monitored !== undefined ? eq(media.monitored, params.monitored) : undefined;

  const [animeRows, totalCountResult] = yield* Effect.all([
    tryDatabasePromise("Failed to list media", () => {
      const baseQuery = db.select().from(media);
      const query = monitoredCondition ? baseQuery.where(monitoredCondition) : baseQuery;
      return query.orderBy(media.id).limit(limit).offset(offset);
    }),
    tryDatabasePromise("Failed to count media", () => {
      const countQuery = db.select({ count: count() }).from(media);
      return monitoredCondition ? countQuery.where(monitoredCondition) : countQuery;
    }),
  ]);

  const animeIds = animeRows.map((row) => row.id);
  const episodeStatsByAnimeId = new Map<number, EpisodeStats>();

  if (animeIds.length > 0) {
    const episodeStats = yield* tryDatabasePromise("Failed to list media", () =>
      db
        .select({
          mediaId: mediaUnits.mediaId,
          downloadedCount: sql<number>`coalesce(sum(case when ${mediaUnits.downloaded} then 1 else 0 end), 0)`,
          latestDownloadedUnit: sql<
            number | null
          >`max(case when ${mediaUnits.downloaded} then ${mediaUnits.number} else null end)`,
        })
        .from(mediaUnits)
        .where(inArray(mediaUnits.mediaId, animeIds))
        .groupBy(mediaUnits.mediaId),
    );

    for (const stat of episodeStats) {
      const latestDownloadedUnit =
        stat.latestDownloadedUnit === null ? undefined : stat.latestDownloadedUnit;

      episodeStatsByAnimeId.set(stat.mediaId, {
        downloaded: stat.downloadedCount ?? 0,
        ...(latestDownloadedUnit === undefined ? {} : { latestDownloadedUnit }),
      });
    }
  }

  const airedEpisodeRows =
    animeIds.length === 0
      ? []
      : yield* tryDatabasePromise("Failed to list media", () =>
          db
            .select({
              mediaId: mediaUnits.mediaId,
              number: mediaUnits.number,
            })
            .from(mediaUnits)
            .where(and(inArray(mediaUnits.mediaId, animeIds), eq(mediaUnits.downloaded, false))),
        );

  const missingNumbersByAnimeId = new Map<number, number[]>();
  for (const row of airedEpisodeRows) {
    const existing = missingNumbersByAnimeId.get(row.mediaId);
    if (existing) {
      existing.push(row.number);
    } else {
      missingNumbersByAnimeId.set(row.mediaId, [row.number]);
    }
  }

  const animeProgressRows = yield* Effect.forEach(animeRows, (row) =>
    toAnimeDtoProgress(row, episodeStatsByAnimeId.get(row.id), missingNumbersByAnimeId.get(row.id)),
  );

  const total = totalCountResult[0]?.count;

  if (total === undefined) {
    return yield* Effect.dieMessage("Media count query returned no rows");
  }

  return {
    has_more: offset + limit < total,
    items: animeProgressRows,
    limit,
    offset,
    total,
  } satisfies MediaListResponse;
});

function toAnimeDtoProgress(
  row: typeof media.$inferSelect,
  progress?: EpisodeStats,
  missingNumbers: readonly number[] = [],
): Effect.Effect<Media, MediaStoredDataError> {
  const downloaded = progress?.downloaded ?? 0;
  const total = row.unitCount ?? undefined;
  const sortedMissing = total
    ? [...missingNumbers]
        .filter((number) => number >= 1 && number <= total)
        .toSorted((left, right) => left - right)
    : [];
  const downloadedPercent =
    total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined;
  const latestDownloadedUnit = progress?.latestDownloadedUnit;

  return Effect.gen(function* () {
    const genres = yield* decodeStoredStringListEffect(row.genres, "genres").pipe(
      Effect.map((value) => value ?? []),
    );
    const recommendedMedia = yield* decodeStoredDiscoveryEntriesEffect(
      row.recommendedMedia,
      "recommendedMedia",
    );
    const relatedMedia = yield* decodeStoredDiscoveryEntriesEffect(
      row.relatedMedia,
      "relatedMedia",
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
      unit_count: row.unitCount ?? undefined,
      favorites: row.favorites ?? undefined,
      format: row.format,
      genres,
      id: brandMediaId(row.id),
      media_kind: decodeMediaKind(row.mediaKind),
      mal_id: row.malId ?? undefined,
      members: row.members ?? undefined,
      monitored: row.monitored,
      popularity: row.popularity ?? undefined,
      next_airing_unit:
        row.nextAiringAt && row.nextAiringUnit
          ? {
              airing_at: row.nextAiringAt,
              unit_number: row.nextAiringUnit,
            }
          : undefined,
      score: row.score ?? undefined,
      profile_name: row.profileName,
      progress: {
        downloaded,
        downloaded_percent: downloadedPercent,
        is_up_to_date: total ? sortedMissing.length === 0 : undefined,
        latest_downloaded_unit: latestDownloadedUnit,
        missing: sortedMissing,
        next_missing_unit: sortedMissing[0],
        total,
      },
      recommended_media: recommendedMedia,
      related_media: relatedMedia,
      release_profile_ids: releaseProfileIds.map(brandReleaseProfileId),
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
    } satisfies Media;
  });
}
