import { Effect, Schema } from "effect";
import { AnimeDiscoveryEntrySchema } from "../../../../../packages/shared/src/index.ts";
import type { Anime, AnimeDiscoveryEntry } from "../../../../../packages/shared/src/index.ts";
import { anime, episodes } from "../../db/schema.ts";
import { AnimeStoredDataError } from "./errors.ts";

interface AnimeDiscoveryMetadata {
  recommended_anime?: AnimeDiscoveryEntry[];
  related_anime?: AnimeDiscoveryEntry[];
  synonyms?: string[];
}

const AnimeDiscoveryEntryListJsonSchema = Schema.parseJson(Schema.Array(AnimeDiscoveryEntrySchema));
const AnimeSynonymsJsonSchema = Schema.parseJson(Schema.Array(Schema.String));
const StringListJsonSchema = Schema.parseJson(Schema.Array(Schema.String));
const NumberListJsonSchema = Schema.parseJson(Schema.Array(Schema.Number));

const decodeStoredStringList = Effect.fn("AnimeDto.decodeStoredStringList")(function* (
  value: string | null,
  field: string,
) {
  if (!value) {
    return [];
  }

  return yield* Schema.decodeUnknown(StringListJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      () =>
        new AnimeStoredDataError({
          message: `Stored anime ${field} JSON is corrupt`,
        }),
    ),
  );
});

const decodeStoredNumberList = Effect.fn("AnimeDto.decodeStoredNumberList")(function* (
  value: string | null,
  field: string,
) {
  if (!value) {
    return [];
  }

  return yield* Schema.decodeUnknown(NumberListJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      () =>
        new AnimeStoredDataError({
          message: `Stored anime ${field} JSON is corrupt`,
        }),
    ),
  );
});

const decodeStoredDiscoveryEntries = Effect.fn("AnimeDto.decodeStoredDiscoveryEntries")(function* (
  value: string | null,
  field: string,
) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(AnimeDiscoveryEntryListJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      () =>
        new AnimeStoredDataError({
          message: `Stored anime ${field} JSON is corrupt`,
        }),
    ),
  );
});

const decodeStoredSynonyms = Effect.fn("AnimeDto.decodeStoredSynonyms")(function* (
  value: string | null,
) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(AnimeSynonymsJsonSchema)(value).pipe(
    Effect.map((decoded) => {
      const filtered = decoded.filter((entry) => entry.length > 0);
      return filtered.length > 0 ? filtered : undefined;
    }),
    Effect.mapError(
      () =>
        new AnimeStoredDataError({
          message: "Stored anime synonyms JSON is corrupt",
        }),
    ),
  );
});

function deriveAnimeSeason(date?: string | null) {
  if (!date) {
    return undefined;
  }

  const month = Number.parseInt(date.split("-")[1] ?? "", 10);

  if (!Number.isFinite(month)) {
    return undefined;
  }

  if (month <= 2 || month === 12) return "winter" as const;
  if (month <= 5) return "spring" as const;
  if (month <= 8) return "summer" as const;
  return "fall" as const;
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
    .sort((left, right) => left - right);
  const total = row.episodeCount ?? undefined;
  const missing = total
    ? range(1, total).filter((number) => !downloadedEpisodes.includes(number))
    : [];
  const downloadedPercent = deriveDownloadedPercent(downloadedEpisodes.length, total);
  const latestDownloadedEpisode = deriveLatestDownloadedEpisode(downloadedEpisodes);
  const season = deriveAnimeSeason(row.startDate);
  const seasonYear = row.startYear ?? extractYearFromDate(row.startDate);
  const genres = yield* decodeStoredStringList(row.genres, "genres");
  const releaseProfileIds = yield* decodeStoredNumberList(
    row.releaseProfileIds,
    "releaseProfileIds",
  );
  const studios = yield* decodeStoredStringList(row.studios, "studios");

  const recommendedAnime =
    discovery?.recommended_anime ??
    (yield* decodeStoredDiscoveryEntries(row.recommendedAnime, "recommendedAnime"));
  const relatedAnime =
    discovery?.related_anime ??
    (yield* decodeStoredDiscoveryEntries(row.relatedAnime, "relatedAnime"));
  const synonyms = discovery?.synonyms ?? (yield* decodeStoredSynonyms(row.synonyms));

  return {
    added_at: row.addedAt,
    banner_image: row.bannerImage ?? undefined,
    cover_image: row.coverImage ?? undefined,
    description: row.description ?? undefined,
    end_date: row.endDate ?? undefined,
    end_year: row.endYear ?? undefined,
    episode_count: row.episodeCount ?? undefined,
    format: row.format,
    genres,
    id: row.id,
    mal_id: row.malId ?? undefined,
    monitored: row.monitored,
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
    release_profile_ids: releaseProfileIds,
    root_folder: row.rootFolder,
    related_anime: relatedAnime,
    score: row.score ?? undefined,
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

function extractYearFromDate(date?: string | null) {
  if (!date) {
    return undefined;
  }

  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}
