import { and, count, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import type {
  Anime,
  AnimeListQueryParams,
  AnimeListResponse,
  AnimeSearchResponse,
  AnimeSearchResult,
  Episode,
} from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import { toAnimeDto } from "@/features/anime/dto.ts";
import { AnimeNotFoundError, AnimeStoredDataError } from "@/features/anime/errors.ts";
import { getAnimeRowEffect } from "@/features/anime/anime-read-repository.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { deriveAnimeSeason, extractYearFromDate } from "@/lib/anime-date-utils.ts";
import {
  deriveEpisodeTimelineMetadata,
  scoreAnimeSearchResultMatch,
} from "@/lib/anime-derivations.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/lib/anime-search-results.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredNumberListEffect,
  decodeStoredStringListEffect,
} from "@/features/anime/decode-support.ts";

export const listAnimeEffect = Effect.fn("AnimeService.listAnimeEffect")(function* (
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
  const episodeStatsByAnimeId = new Map<
    number,
    { downloaded: number; latestDownloadedEpisode?: number }
  >();

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
      episodeStatsByAnimeId.set(stat.animeId, {
        downloaded: Number(stat.downloadedCount ?? 0),
        latestDownloadedEpisode:
          stat.latestDownloadedEpisode === null ? undefined : Number(stat.latestDownloadedEpisode),
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
    return yield* new AnimeStoredDataError({
      message: "Anime count query returned no rows",
    });
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
  progress?: {
    downloaded: number;
    latestDownloadedEpisode?: number;
  },
  missingNumbers: readonly number[] = [],
): Effect.Effect<Anime, AnimeStoredDataError> {
  const downloaded = progress?.downloaded ?? 0;
  const total = row.episodeCount ?? undefined;
  const sortedMissing = total
    ? [...missingNumbers]
        .filter((number) => number >= 1 && number <= total)
        .sort((left, right) => left - right)
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
      season: deriveAnimeSeason(row.startDate ?? undefined),
      season_year: row.startYear ?? extractYearFromDate(row.startDate),
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
    };
  });
}

export const getAnimeEffect = Effect.fn("AnimeService.getAnimeEffect")(function* (input: {
  db: AppDatabase;
  id: number;
}) {
  const row = yield* getAnimeRowEffect(input.db, input.id);
  const episodeRows = yield* tryDatabasePromise("Failed to load anime", () =>
    input.db.select().from(episodes).where(eq(episodes.animeId, input.id)),
  );

  return yield* toAnimeDto(row, episodeRows);
});

export const searchAnimeEffect = Effect.fn("AnimeService.searchAnimeEffect")(function* (input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  query: string;
}) {
  const results = yield* input.aniList.searchAnimeMetadata(input.query);

  const annotated = annotateAnimeSearchResultsForQuery(input.query, results);

  const marked = yield* markSearchResultsAlreadyInLibraryEffect(input.db, annotated);

  return {
    degraded: false,
    results: marked,
  } satisfies AnimeSearchResponse;
});

export const getAnimeByAnilistIdEffect = Effect.fn("AnimeService.getAnimeByAnilistIdEffect")(
  function* (input: { aniList: typeof AniListClient.Service; db: AppDatabase; id: number }) {
    const metadata = yield* input.aniList.getAnimeMetadataById(input.id);

    if (!metadata) {
      return yield* new AnimeNotFoundError({
        message: "Anime not found",
      });
    }

    const existing = yield* tryDatabasePromise("Failed to check library status", () =>
      input.db.select({ id: anime.id }).from(anime).where(eq(anime.id, input.id)).limit(1),
    );

    return {
      already_in_library: Boolean(existing[0]),
      banner_image: metadata.bannerImage,
      cover_image: metadata.coverImage,
      description: metadata.description,
      end_date: metadata.endDate,
      end_year: metadata.endYear,
      episode_count: metadata.episodeCount,
      format: metadata.format,
      genres: metadata.genres ? [...metadata.genres] : undefined,
      id: metadata.id,
      recommended_anime: metadata.recommendedAnime ? [...metadata.recommendedAnime] : undefined,
      related_anime: metadata.relatedAnime ? [...metadata.relatedAnime] : undefined,
      season: deriveAnimeSeason(metadata.startDate),
      season_year: metadata.startYear,
      start_date: metadata.startDate,
      start_year: metadata.startYear,
      status: metadata.status,
      synonyms: metadata.synonyms ? [...metadata.synonyms] : undefined,
      title: metadata.title,
    } satisfies AnimeSearchResult;
  },
);

export const listEpisodesEffect = Effect.fn("AnimeService.listEpisodesEffect")(function* (input: {
  animeId: number;
  db: AppDatabase;
  now: Date;
}) {
  const rows = yield* tryDatabasePromise("Failed to list episodes", () =>
    input.db.select().from(episodes).where(eq(episodes.animeId, input.animeId)),
  );

  return rows
    .sort((left, right) => left.number - right.number)
    .map((row): Episode => {
      const timeline = deriveEpisodeTimelineMetadata(row.aired ?? undefined, input.now);

      return {
        aired: row.aired ?? undefined,
        airing_status: timeline.airing_status,
        audio_channels: row.audioChannels ?? undefined,
        audio_codec: row.audioCodec ?? undefined,
        downloaded: row.downloaded,
        duration_seconds: row.durationSeconds ?? undefined,
        file_path: row.filePath ?? undefined,
        file_size: row.fileSize ?? undefined,
        group: row.groupName ?? undefined,
        is_future: timeline.is_future,
        number: row.number,
        quality: row.quality ?? undefined,
        resolution: row.resolution ?? undefined,
        title: row.title ?? undefined,
        video_codec: row.videoCodec ?? undefined,
      };
    });
});

export function annotateAnimeSearchResultsForQuery(
  query: string,
  results: readonly AnimeSearchResult[],
) {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return [...results];
  }

  return results.map((result) => {
    const confidence = roundConfidence(scoreAnimeSearchResultMatch(trimmed, result));

    return {
      ...result,
      match_confidence: confidence,
      match_reason: describeAnimeSearchMatch(trimmed, confidence),
    } satisfies AnimeSearchResult;
  });
}

function describeAnimeSearchMatch(query: string, confidence: number) {
  if (confidence >= 0.99) {
    return `Exact title match for ${JSON.stringify(query)}`;
  }

  if (confidence >= 0.8) {
    return `Strong title match for ${JSON.stringify(query)}`;
  }

  return `Partial title match for ${JSON.stringify(query)}`;
}

function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}
