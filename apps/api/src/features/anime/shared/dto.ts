import { Effect } from "effect";
import {
  brandAnimeId,
  brandReleaseProfileId,
  type Anime,
  type AnimeDiscoveryEntry,
} from "@packages/shared/index.ts";
import { anime, episodes } from "@/db/schema.ts";
import { deriveAnimeSeason, extractYearFromDate } from "@/domain/anime/date-utils.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredNumberListEffect,
  decodeStoredStringListEffect,
  decodeStoredSynonymsEffect,
} from "@/features/anime/shared/decode-support.ts";

interface AnimeDiscoveryMetadata {
  recommended_anime?: AnimeDiscoveryEntry[];
  related_anime?: AnimeDiscoveryEntry[];
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

export const toAnimeDto = Effect.fn("AnimeDto.toAnimeDto")(function* (
  row: typeof anime.$inferSelect,
  episodeRows: Array<typeof episodes.$inferSelect>,
  discovery?: AnimeDiscoveryMetadata,
) {
  const downloadedEpisodes = episodeRows
    .filter((episode) => episode.downloaded)
    .map((episode) => episode.number)
    .toSorted((left, right) => left - right);
  const total = row.episodeCount ?? undefined;
  const missing = total
    ? range(1, total).filter((number) => !downloadedEpisodes.includes(number))
    : [];
  const downloadedPercent = deriveDownloadedPercent(downloadedEpisodes.length, total);
  const latestDownloadedEpisode = deriveLatestDownloadedEpisode(downloadedEpisodes);
  const season = deriveAnimeSeason(row.startDate);
  const seasonYear = row.startYear ?? extractYearFromDate(row.startDate);
  const genres = yield* decodeStoredStringListEffect(row.genres, "genres");
  const releaseProfileIds = yield* decodeStoredNumberListEffect(
    row.releaseProfileIds,
    "releaseProfileIds",
  );
  const studios = yield* decodeStoredStringListEffect(row.studios, "studios");

  const recommendedAnime =
    discovery?.recommended_anime ??
    (yield* decodeStoredDiscoveryEntriesEffect(row.recommendedAnime, "recommendedAnime"));
  const relatedAnime =
    discovery?.related_anime ??
    (yield* decodeStoredDiscoveryEntriesEffect(row.relatedAnime, "relatedAnime"));
  const synonyms = discovery?.synonyms ?? (yield* decodeStoredSynonymsEffect(row.synonyms));

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
    id: brandAnimeId(row.id),
    mal_id: row.malId ?? undefined,
    members: row.members ?? undefined,
    monitored: row.monitored,
    popularity: row.popularity ?? undefined,
    next_airing_episode:
      row.nextAiringEpisode && row.nextAiringAt
        ? {
            airing_at: row.nextAiringAt,
            episode: row.nextAiringEpisode,
          }
        : undefined,
    recommended_anime: recommendedAnime,
    profile_name: row.profileName,
    progress: {
      downloaded: downloadedEpisodes.length,
      downloaded_percent: downloadedPercent,
      is_up_to_date: total ? missing.length === 0 : undefined,
      latest_downloaded_episode: latestDownloadedEpisode,
      missing,
      next_missing_episode: missing[0],
      total,
    },
    release_profile_ids: releaseProfileIds.map(brandReleaseProfileId),
    root_folder: row.rootFolder,
    rank: row.rank ?? undefined,
    rating: row.rating ?? undefined,
    related_anime: relatedAnime,
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
  } satisfies Anime;
});

function range(start: number, end: number) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index);
}
