import { and, count, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import type {
  Anime,
  AnimeDiscoveryEntry,
  AnimeListQueryParams,
  AnimeListResponse,
  AnimeSearchResponse,
  AnimeSearchResult,
  Episode,
} from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime, episodes } from "../../db/schema.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import {
  type MediaProbeShape,
  mergeProbedMediaMetadata,
  shouldProbeDetailedMediaMetadata,
} from "../../lib/media-probe.ts";
import { parseFileSourceIdentity } from "../../lib/media-identity.ts";
import type { AniListClient } from "./anilist.ts";
import { buildScannedFileMetadata } from "../operations/naming-support.ts";
import { scoreAnimeSearchResultMatch } from "../operations/library-import.ts";
import { toAnimeDto } from "./dto.ts";
import { AnimeNotFoundError } from "./errors.ts";
import {
  getAnimeRowOrThrow,
  markSearchResultsAlreadyInLibrary,
} from "./repository.ts";
import { tryAnimePromise, tryDatabasePromise } from "./service-support.ts";

export const listAnimeEffect = Effect.fn("AnimeService.listAnimeEffect")(
  function* (db: AppDatabase, params: AnimeListQueryParams = {}) {
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const offset = Math.max(params.offset ?? 0, 0);

    const monitoredCondition = params.monitored !== undefined
      ? eq(anime.monitored, params.monitored)
      : undefined;

    const [animeRows, totalCountResult] = yield* Effect.all([
      tryDatabasePromise("Failed to list anime", () => {
        const baseQuery = db.select().from(anime);
        const query = monitoredCondition
          ? baseQuery.where(monitoredCondition)
          : baseQuery;
        return query.orderBy(anime.id).limit(limit).offset(offset);
      }),
      tryDatabasePromise("Failed to count anime", () => {
        const countQuery = db.select({ count: count() }).from(anime);
        return monitoredCondition
          ? countQuery.where(monitoredCondition)
          : countQuery;
      }),
    ]);

    const animeIds = animeRows.map((row) => row.id);
    const episodeStatsByAnimeId = new Map<
      number,
      { downloaded: number; latestDownloadedEpisode?: number }
    >();

    if (animeIds.length > 0) {
      const episodeStats = yield* tryDatabasePromise(
        "Failed to list anime",
        () =>
          db.select({
            animeId: episodes.animeId,
            downloadedCount: sql<
              number
            >`coalesce(sum(case when ${episodes.downloaded} then 1 else 0 end), 0)`,
            latestDownloadedEpisode: sql<
              number | null
            >`max(case when ${episodes.downloaded} then ${episodes.number} else null end)`,
          }).from(episodes).where(
            inArray(episodes.animeId, animeIds),
          ).groupBy(episodes.animeId),
      );

      for (const stat of episodeStats) {
        episodeStatsByAnimeId.set(stat.animeId, {
          downloaded: Number(stat.downloadedCount ?? 0),
          latestDownloadedEpisode: stat.latestDownloadedEpisode === null
            ? undefined
            : Number(stat.latestDownloadedEpisode),
        });
      }
    }

    const airedEpisodeRows = animeIds.length === 0
      ? []
      : yield* tryDatabasePromise(
        "Failed to list anime",
        () =>
          db.select({
            animeId: episodes.animeId,
            number: episodes.number,
          }).from(episodes).where(
            and(
              inArray(episodes.animeId, animeIds),
              eq(episodes.downloaded, false),
            ),
          ),
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

    const animeProgressRows = animeRows.map((row): Anime =>
      toAnimeDtoProgress(
        row,
        episodeStatsByAnimeId.get(row.id),
        missingNumbersByAnimeId.get(row.id),
      )
    );

    const total = totalCountResult[0]?.count ?? 0;

    return {
      has_more: offset + limit < total,
      items: animeProgressRows,
      limit,
      offset,
      total,
    } satisfies AnimeListResponse;
  },
);

function toAnimeDtoProgress(
  row: typeof anime.$inferSelect,
  progress?: {
    downloaded: number;
    latestDownloadedEpisode?: number;
  },
  missingNumbers: readonly number[] = [],
): Anime {
  const downloaded = progress?.downloaded ?? 0;
  const total = row.episodeCount ?? undefined;
  const sortedMissing = total
    ? [...missingNumbers].filter((number) => number >= 1 && number <= total)
      .sort((left, right) => left - right)
    : [];
  const downloadedPercent = total && total > 0
    ? Math.min(100, Math.round((downloaded / total) * 100))
    : undefined;
  const latestDownloadedEpisode = progress?.latestDownloadedEpisode;

  return {
    added_at: row.addedAt,
    banner_image: row.bannerImage ?? undefined,
    cover_image: row.coverImage ?? undefined,
    description: row.description ?? undefined,
    end_date: row.endDate ?? undefined,
    end_year: row.endYear ?? undefined,
    episode_count: row.episodeCount ?? undefined,
    format: row.format,
    genres: safeParseStringList(row.genres) ?? [],
    id: row.id,
    mal_id: row.malId ?? undefined,
    monitored: row.monitored,
    next_airing_episode: row.nextAiringAt && row.nextAiringEpisode
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
    recommended_anime: safeParseDiscoveryEntries(row.recommendedAnime),
    related_anime: safeParseDiscoveryEntries(row.relatedAnime),
    release_profile_ids: safeParseNumberList(row.releaseProfileIds),
    root_folder: row.rootFolder,
    season: deriveAnimeSeasonFromDate(row.startDate ?? undefined),
    season_year: row.startYear ?? extractYearFromDate(row.startDate),
    start_date: row.startDate ?? undefined,
    start_year: row.startYear ?? undefined,
    status: row.status,
    studios: safeParseStringList(row.studios) ?? [],
    synonyms: safeParseStringList(row.synonyms),
    title: {
      english: row.titleEnglish ?? undefined,
      native: row.titleNative ?? undefined,
      romaji: row.titleRomaji,
    },
  };
}

const searchLocalAnimeEffect = Effect.fn("AnimeService.searchLocalAnimeEffect")(
  function* (input: {
    db: AppDatabase;
    query: string;
  }) {
    const trimmed = input.query.trim();

    if (trimmed.length === 0) {
      return [] as AnimeSearchResult[];
    }

    const rows = yield* tryDatabasePromise(
      "Failed to search anime",
      () => input.db.select().from(anime),
    );

    return rows
      .map((row) => {
        const candidate = toLocalAnimeSearchResult(row);

        return {
          candidate,
          score: scoreAnimeSearchResultMatch(trimmed, candidate),
        };
      })
      .filter((entry) => entry.score >= 0.55)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }

        return left.candidate.id - right.candidate.id;
      })
      .slice(0, 10)
      .map((entry) => entry.candidate);
  },
);

export const getAnimeEffect = Effect.fn("AnimeService.getAnimeEffect")(
  function* (input: { db: AppDatabase; id: number }) {
    const row = yield* tryAnimePromise(
      "Failed to load anime",
      () => getAnimeRowOrThrow(input.db, input.id),
    );
    const episodeRows = yield* tryAnimePromise(
      "Failed to load anime",
      () =>
        input.db.select().from(episodes).where(eq(episodes.animeId, input.id)),
    );

    return toAnimeDto(row, episodeRows);
  },
);

export const searchAnimeEffect = Effect.fn("AnimeService.searchAnimeEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    db: AppDatabase;
    query: string;
  }) {
    const { degraded, results } = yield* input.aniList.searchAnimeMetadata(
      input.query,
    ).pipe(
      Effect.map((remoteResults) => ({
        degraded: false,
        results: remoteResults,
      })),
      Effect.catchTag(
        "ExternalCallError",
        () =>
          searchLocalAnimeEffect({ db: input.db, query: input.query }).pipe(
            Effect.map((localResults) => ({
              degraded: true,
              results: localResults,
            })),
          ),
      ),
    );

    const annotated = annotateAnimeSearchResultsForQuery(input.query, results);

    const marked = yield* tryDatabasePromise(
      "Failed to check library status",
      () => markSearchResultsAlreadyInLibrary(input.db, annotated),
    );

    return {
      degraded,
      results: marked,
    } satisfies AnimeSearchResponse;
  },
);

function toLocalAnimeSearchResult(
  row: typeof anime.$inferSelect,
): AnimeSearchResult {
  return {
    already_in_library: true,
    banner_image: row.bannerImage ?? undefined,
    cover_image: row.coverImage ?? undefined,
    description: row.description ?? undefined,
    end_date: row.endDate ?? undefined,
    end_year: row.endYear ?? undefined,
    episode_count: row.episodeCount ?? undefined,
    format: row.format,
    genres: safeParseStringList(row.genres),
    id: row.id,
    season: deriveAnimeSeasonFromDate(row.startDate ?? undefined),
    season_year: row.startYear ?? undefined,
    start_date: row.startDate ?? undefined,
    start_year: row.startYear ?? undefined,
    status: row.status,
    synonyms: safeParseStringList(row.synonyms),
    title: {
      english: row.titleEnglish ?? undefined,
      native: row.titleNative ?? undefined,
      romaji: row.titleRomaji,
    },
  } satisfies AnimeSearchResult;
}

function safeParseStringList(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return undefined;
    }

    const normalized = parsed.filter((entry): entry is string =>
      typeof entry === "string" && entry.length > 0
    );

    return normalized.length > 0 ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function safeParseNumberList(value: string | null): number[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is number =>
      typeof entry === "number" && Number.isFinite(entry)
    );
  } catch {
    return [];
  }
}

function safeParseDiscoveryEntries(
  value: string | null,
): AnimeDiscoveryEntry[] | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as AnimeDiscoveryEntry[];
  } catch {
    return undefined;
  }
}

function deriveAnimeSeasonFromDate(date: string | undefined) {
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

function extractYearFromDate(date?: string | null) {
  if (!date) {
    return undefined;
  }

  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

export const getAnimeByAnilistIdEffect = Effect.fn(
  "AnimeService.getAnimeByAnilistIdEffect",
)(function* (input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  id: number;
}) {
  const metadata = yield* input.aniList.getAnimeMetadataById(input.id);

  if (!metadata) {
    return yield* new AnimeNotFoundError({
      message: "Anime not found",
    });
  }

  const existing = yield* tryDatabasePromise(
    "Failed to check library status",
    () =>
      input.db.select({ id: anime.id }).from(anime).where(
        eq(anime.id, input.id),
      )
        .limit(1),
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
    genres: metadata.genres,
    id: metadata.id,
    recommended_anime: metadata.recommendedAnime,
    related_anime: metadata.relatedAnime,
    season: metadata.startDate
      ? (() => {
        const month = Number.parseInt(
          metadata.startDate.split("-")[1] ?? "",
          10,
        );
        if (!Number.isFinite(month)) return undefined;
        if (month <= 2 || month === 12) return "winter" as const;
        if (month <= 5) return "spring" as const;
        if (month <= 8) return "summer" as const;
        return "fall" as const;
      })()
      : undefined,
    season_year: metadata.startYear,
    start_date: metadata.startDate,
    start_year: metadata.startYear,
    status: metadata.status,
    synonyms: metadata.synonyms,
    title: metadata.title,
  } satisfies AnimeSearchResult;
});

export const listEpisodesEffect = Effect.fn("AnimeService.listEpisodesEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    fs: FileSystemShape;
    mediaProbe: MediaProbeShape;
  }) {
    const rows = yield* tryDatabasePromise(
      "Failed to list episodes",
      () =>
        input.db.select().from(episodes).where(
          eq(episodes.animeId, input.animeId),
        ),
    );
    const metadataByPath = new Map(
      yield* Effect.forEach(
        [
          ...new Set(
            rows.map((row) => row.filePath).filter((value): value is string =>
              Boolean(value)
            ),
          ),
        ],
        (filePath) =>
          Effect.gen(function* () {
            const parsed = parseFileSourceIdentity(filePath);
            const metadata = buildScannedFileMetadata({
              filePath,
              group: parsed.group,
              sourceIdentity: toSharedParsedEpisodeIdentity(
                parsed.source_identity,
              ),
            });
            const fileSize = yield* input.fs.stat(filePath).pipe(
              Effect.map((info) => info.size),
              Effect.catchTag(
                "FileSystemError",
                () => Effect.void,
              ),
              Effect.map((size) => size ?? undefined),
            );
            const enrichedMetadata = shouldProbeDetailedMediaMetadata({
                duration_seconds: metadata.duration_seconds,
                audio_channels: metadata.audio_channels,
                audio_codec: metadata.audio_codec,
                resolution: parsed.resolution ?? undefined,
                video_codec: metadata.video_codec,
              })
              ? mergeProbedMediaMetadata(
                {
                  duration_seconds: metadata.duration_seconds,
                  audio_channels: metadata.audio_channels,
                  audio_codec: metadata.audio_codec,
                  resolution: parsed.resolution ?? undefined,
                  video_codec: metadata.video_codec,
                },
                yield* input.mediaProbe.probeVideoFile(filePath),
              )
              : {
                duration_seconds: metadata.duration_seconds,
                audio_channels: metadata.audio_channels,
                audio_codec: metadata.audio_codec,
                resolution: parsed.resolution ?? undefined,
                video_codec: metadata.video_codec,
              };

            return [
              filePath,
              {
                audio_channels: enrichedMetadata.audio_channels,
                audio_codec: enrichedMetadata.audio_codec,
                duration_seconds: enrichedMetadata.duration_seconds,
                file_size: fileSize,
                group: parsed.group ?? undefined,
                quality: metadata.quality,
                resolution: enrichedMetadata.resolution,
                video_codec: enrichedMetadata.video_codec,
              },
            ] as const;
          }),
        { concurrency: 8 },
      ),
    );

    return rows.sort((left, right) => left.number - right.number).map((
      row,
    ): Episode => {
      const timeline = deriveEpisodeTimelineMetadata(row.aired ?? undefined);

      return {
        aired: row.aired ?? undefined,
        airing_status: timeline.airing_status,
        audio_channels: row.filePath
          ? metadataByPath.get(row.filePath)?.audio_channels
          : undefined,
        audio_codec: row.filePath
          ? metadataByPath.get(row.filePath)?.audio_codec
          : undefined,
        downloaded: row.downloaded,
        duration_seconds: row.filePath
          ? metadataByPath.get(row.filePath)?.duration_seconds
          : undefined,
        file_path: row.filePath ?? undefined,
        file_size: row.filePath
          ? metadataByPath.get(row.filePath)?.file_size
          : undefined,
        group: row.filePath
          ? metadataByPath.get(row.filePath)?.group
          : undefined,
        is_future: timeline.is_future,
        number: row.number,
        quality: row.filePath
          ? metadataByPath.get(row.filePath)?.quality
          : undefined,
        resolution: row.filePath
          ? metadataByPath.get(row.filePath)?.resolution
          : undefined,
        title: row.title ?? undefined,
        video_codec: row.filePath
          ? metadataByPath.get(row.filePath)?.video_codec
          : undefined,
      };
    });
  },
);

export function deriveEpisodeTimelineMetadata(
  aired?: string,
  now = new Date(),
): Pick<Episode, "airing_status" | "is_future"> {
  if (!aired) {
    return { airing_status: "unknown" };
  }

  const airedAt = new Date(aired);
  if (Number.isNaN(airedAt.getTime())) {
    return { airing_status: "unknown" };
  }

  if (airedAt > now) {
    return {
      airing_status: "future",
      is_future: true,
    };
  }

  return {
    airing_status: "aired",
    is_future: false,
  };
}

function toSharedParsedEpisodeIdentity(
  identity: ReturnType<typeof parseFileSourceIdentity>["source_identity"],
) {
  if (!identity) {
    return undefined;
  }

  switch (identity.scheme) {
    case "season":
      return {
        episode_numbers: [...identity.episode_numbers],
        label: identity.label,
        scheme: "season" as const,
        season: identity.season,
      };
    case "absolute":
      return {
        episode_numbers: [...identity.episode_numbers],
        label: identity.label,
        scheme: "absolute" as const,
      };
    case "daily":
      return {
        air_dates: [...identity.air_dates],
        label: identity.label,
        scheme: "daily" as const,
      };
  }
}

export function annotateAnimeSearchResultsForQuery(
  query: string,
  results: readonly AnimeSearchResult[],
) {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return [...results];
  }

  return results.map((result) => {
    const confidence = roundConfidence(
      scoreAnimeSearchResultMatch(trimmed, result),
    );

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
