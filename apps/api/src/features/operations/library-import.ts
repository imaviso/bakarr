import { and, eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

import type { AnimeSearchResult, Config, RenamePreviewItem } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import {
  buildEpisodeFilenamePlan,
  selectNamingFormat,
} from "@/features/operations/naming-support.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { deriveAnimeSeason, extractYearFromDate } from "@/lib/anime-date-utils.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";

export {
  analyzeScannedFile,
  findBestLocalAnimeMatch,
  scoreAnimeRowMatch,
  titlesMatch,
  type AnalyzedFile,
} from "@/features/operations/library-import-analysis-support.ts";

const AnimeGenresJsonSchema = Schema.parseJson(Schema.Array(Schema.String));

const decodeAnimeGenres = Effect.fn("Operations.decodeAnimeGenres")(function* (
  value: string | null,
) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(AnimeGenresJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      (cause) =>
        new OperationsStoredDataError({
          cause,
          message: "Stored anime genres are corrupt",
        }),
    ),
  );
});

export const buildRenamePreview = Effect.fn("OperationsService.buildRenamePreview")(function* (
  db: AppDatabase,
  animeId: number,
  runtimeConfig: Config,
) {
  const animeRow = yield* requireAnime(db, animeId);
  const namingSettings = {
    movieNamingFormat: runtimeConfig.library.movie_naming_format,
    namingFormat: runtimeConfig.library.naming_format,
    preferredTitle: runtimeConfig.library.preferred_title,
  };
  const namingFormat = selectNamingFormat(animeRow, namingSettings);
  const rows = yield* tryDatabasePromise("Failed to load episodes for rename preview", () =>
    db
      .select()
      .from(episodes)
      .where(and(eq(episodes.animeId, animeId), sql`${episodes.filePath} is not null`)),
  );

  // Group rows by file path to handle multi-episode files
  const fileGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.filePath) continue;
    const existing = fileGroups.get(row.filePath) ?? [];
    existing.push(row);
    fileGroups.set(row.filePath, existing);
  }

  const results: RenamePreviewItem[] = [];
  for (const [filePath, groupRows] of fileGroups) {
    const episodeNumbers = groupRows.map((r) => r.number).toSorted((a, b) => a - b);
    const [primaryEpisode] = episodeNumbers;

    if (primaryEpisode === undefined) {
      continue;
    }

    const extension = filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".")) : ".mkv";
    const plan = buildEpisodeFilenamePlan({
      animeRow,
      episodeNumbers,
      episodeRows: groupRows,
      filePath,
      namingFormat,
      preferredTitle: namingSettings.preferredTitle,
    });
    const filename = `${plan.baseName}${extension}`;
    results.push({
      current_path: filePath,
      episode_number: primaryEpisode,
      episode_numbers: episodeNumbers.length > 1 ? episodeNumbers : undefined,
      fallback_used: plan.fallbackUsed || undefined,
      format_used: plan.formatUsed,
      metadata_snapshot: plan.metadataSnapshot,
      missing_fields: plan.missingFields.length > 0 ? [...plan.missingFields] : undefined,
      new_filename: filename,
      new_path: `${animeRow.rootFolder.replace(/\/$/, "")}/${filename}`,
      warnings: plan.warnings.length > 0 ? [...plan.warnings] : undefined,
    });
  }

  return results;
});

export const toAnimeSearchCandidate = Effect.fn("Operations.toAnimeSearchCandidate")(function* (
  row: typeof anime.$inferSelect,
) {
  return {
    already_in_library: true,
    banner_image: row.bannerImage ?? undefined,
    cover_image: row.coverImage ?? undefined,
    description: row.description ?? undefined,
    end_date: row.endDate ?? undefined,
    end_year: row.endYear ?? undefined,
    episode_count: row.episodeCount ?? undefined,
    format: row.format,
    genres: yield* decodeAnimeGenres(row.genres),
    id: row.id,
    season: deriveAnimeSeason(row.startDate),
    season_year: row.startYear ?? extractYearFromDate(row.startDate),
    start_date: row.startDate ?? undefined,
    start_year: row.startYear ?? undefined,
    status: row.status,
    title: {
      english: row.titleEnglish ?? undefined,
      native: row.titleNative ?? undefined,
      romaji: row.titleRomaji,
    },
  } satisfies AnimeSearchResult;
});
