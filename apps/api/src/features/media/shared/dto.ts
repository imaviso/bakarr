import { Effect } from "effect";
import {
  brandMediaId,
  brandReleaseProfileId,
  type Media,
  type MediaDiscoveryEntry,
} from "@packages/shared/index.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { deriveAnimeSeason, extractYearFromDate } from "@/domain/media/date-utils.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredNumberListEffect,
  decodeStoredStringListEffect,
  decodeStoredSynonymsEffect,
} from "@/features/media/shared/decode-support.ts";
import { decodeMediaKind } from "@/features/media/shared/media-kind.ts";

export type MediaDtoProgress = Media["progress"];

/**
 * Detail-path progress: derive from the full persisted episode rows.
 * `missing` is the complement of downloaded units within [1, total].
 */
export function deriveDetailProgress(
  episodeRows: readonly (typeof mediaUnits.$inferSelect)[],
  total: number | undefined,
): MediaDtoProgress {
  const downloadedUnits = episodeRows
    .filter((episode) => episode.downloaded)
    .map((episode) => episode.number)
    .toSorted((left, right) => left - right);
  const missing = total
    ? range(1, total).filter((number) => !downloadedUnits.includes(number))
    : [];
  const downloadedPercent = deriveDownloadedPercent(downloadedUnits.length, total);
  const latestDownloadedUnit = deriveLatestDownloadedEpisode(downloadedUnits);

  return {
    downloaded: downloadedUnits.length,
    downloaded_percent: downloadedPercent,
    is_up_to_date: total ? missing.length === 0 : undefined,
    latest_downloaded_unit: latestDownloadedUnit,
    missing,
    next_missing_unit: missing[0],
    total,
  };
}

/**
 * List-path progress: derive from pre-aggregated episode stats and the aired
 * (missing) unit numbers. `missingNumbers` are clamped to [1, total].
 */
export function deriveListProgress(input: {
  readonly downloaded: number;
  readonly latestDownloadedUnit?: number;
  readonly missingNumbers: readonly number[];
  readonly total: number | undefined;
}): MediaDtoProgress {
  const { downloaded, latestDownloadedUnit, missingNumbers, total } = input;
  const missing = total
    ? [...missingNumbers]
        .filter((number) => number >= 1 && number <= total)
        .toSorted((left, right) => left - right)
    : [];
  const downloadedPercent = deriveDownloadedPercent(downloaded, total);

  return {
    downloaded,
    downloaded_percent: downloadedPercent,
    is_up_to_date: total ? missing.length === 0 : undefined,
    latest_downloaded_unit: latestDownloadedUnit,
    missing,
    next_missing_unit: missing[0],
    total,
  };
}

interface AnimeDiscoveryMetadata {
  recommended_media?: MediaDiscoveryEntry[];
  related_media?: MediaDiscoveryEntry[];
  synonyms?: string[];
}

function deriveLatestDownloadedEpisode(numbers: number[]) {
  return numbers.length > 0 ? numbers[numbers.length - 1] : undefined;
}

function deriveDownloadedPercent(downloaded: number, total?: number) {
  if (!total || total <= 0) {
    return undefined;
  }

  return Math.min(100, Math.round((downloaded / total) * 100));
}

/**
 * Canonical media DTO mapper. `progress` is computed by the caller via
 * `deriveDetailProgress` (detail paths) or `deriveListProgress` (list paths).
 * Pass `synonymsAsEmptyList` to decode synonyms as `[]` on empty storage
 * (list path) instead of `undefined` (detail path).
 */
export const toMediaDto = Effect.fn("MediaDto.toMediaDto")(function* (
  row: typeof media.$inferSelect,
  progress: MediaDtoProgress,
  discovery?: AnimeDiscoveryMetadata,
  options?: { readonly synonymsAsEmptyList?: boolean },
) {
  const season = deriveAnimeSeason(row.startDate);
  const seasonYear = row.startYear ?? extractYearFromDate(row.startDate);
  const genres = yield* decodeStoredStringListEffect(row.genres, "genres");
  const releaseProfileIds = yield* decodeStoredNumberListEffect(
    row.releaseProfileIds,
    "releaseProfileIds",
  );
  const studios = yield* decodeStoredStringListEffect(row.studios, "studios");

  const recommendedMedia =
    discovery?.recommended_media ??
    (yield* decodeStoredDiscoveryEntriesEffect(row.recommendedMedia, "recommendedMedia"));
  const relatedMedia =
    discovery?.related_media ??
    (yield* decodeStoredDiscoveryEntriesEffect(row.relatedMedia, "relatedMedia"));
  const synonyms =
    discovery?.synonyms ??
    (options?.synonymsAsEmptyList
      ? yield* decodeStoredStringListEffect(row.synonyms, "synonyms")
      : yield* decodeStoredSynonymsEffect(row.synonyms));

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
      row.nextAiringUnit && row.nextAiringAt
        ? {
            airing_at: row.nextAiringAt,
            unit_number: row.nextAiringUnit,
          }
        : undefined,
    recommended_media: recommendedMedia,
    profile_name: row.profileName,
    progress,
    release_profile_ids: releaseProfileIds.map(brandReleaseProfileId),
    root_folder: row.rootFolder,
    rank: row.rank ?? undefined,
    rating: row.rating ?? undefined,
    related_media: relatedMedia,
    score: row.score ?? undefined,
    source: row.source ?? undefined,
    season,
    season_year: seasonYear,
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

function range(start: number, end: number) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index);
}
