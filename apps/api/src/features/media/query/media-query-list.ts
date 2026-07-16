import { Effect } from "effect";

import {
  brandMediaId,
  brandReleaseProfileId,
  type Media,
  type MediaListQueryParams,
  type MediaListResponse,
} from "@packages/shared/index.ts";
import { media } from "@/db/schema.ts";
import { StoredDataError } from "@/features/errors.ts";
import { deriveAnimeSeason, extractYearFromDate } from "@/domain/media/date-utils.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredNumberListEffect,
  decodeStoredStringListEffect,
} from "@/features/media/shared/decode-support.ts";
import { decodeMediaKind } from "@/features/media/shared/media-kind.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";

interface EpisodeStats {
  readonly downloaded: number;
  readonly latestDownloadedUnit?: number;
}

const DTO_PROGRESS_YIELD_INTERVAL = 50;

export const listMediaEffect = Effect.fn("MediaQueryList.listMediaEffect")(function* (
  mediaRepository: MediaRepositoryShape,
  params: MediaListQueryParams = {},
) {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);
  const monitoredFilter = params.monitored === undefined ? {} : { monitored: params.monitored };

  const [animeRows, total] = yield* Effect.all([
    mediaRepository.listMediaRows({ ...monitoredFilter, limit, offset }),
    mediaRepository.countMedia(monitoredFilter),
  ]);

  const animeIds = animeRows.map((row) => row.id);
  const episodeStatsByAnimeId = new Map<number, EpisodeStats>();

  if (animeIds.length > 0) {
    const episodeStats = yield* mediaRepository.listUnitProgressStats(animeIds);

    for (const stat of episodeStats) {
      const latestDownloadedUnit =
        stat.latestDownloadedUnit === null ? undefined : stat.latestDownloadedUnit;

      episodeStatsByAnimeId.set(stat.mediaId, {
        downloaded: stat.downloadedCount ?? 0,
        ...(latestDownloadedUnit === undefined ? {} : { latestDownloadedUnit }),
      });
    }
  }

  const airedEpisodeRows = yield* mediaRepository.listMissingUnitNumbers(animeIds);

  const missingNumbersByAnimeId = new Map<number, number[]>();
  for (const row of airedEpisodeRows) {
    const existing = missingNumbersByAnimeId.get(row.mediaId);
    if (existing) {
      existing.push(row.number);
    } else {
      missingNumbersByAnimeId.set(row.mediaId, [row.number]);
    }
  }

  const animeProgressRows: Media[] = [];
  for (let index = 0; index < animeRows.length; index++) {
    if (index > 0 && index % DTO_PROGRESS_YIELD_INTERVAL === 0) {
      yield* Effect.yieldNow();
    }

    const row = animeRows[index];
    if (!row) {
      continue;
    }

    animeProgressRows.push(
      yield* toMediaDtoProgress(
        row,
        episodeStatsByAnimeId.get(row.id),
        missingNumbersByAnimeId.get(row.id),
      ),
    );
  }

  return {
    has_more: offset + limit < total,
    items: animeProgressRows,
    limit,
    offset,
    total,
  } satisfies MediaListResponse;
});

function toMediaDtoProgress(
  row: typeof media.$inferSelect,
  progress?: EpisodeStats,
  missingNumbers: readonly number[] = [],
): Effect.Effect<Media, StoredDataError> {
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
