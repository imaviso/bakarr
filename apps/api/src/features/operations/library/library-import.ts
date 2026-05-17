import { and, eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

import {
  brandMediaId,
  type MediaSearchResult,
  type Config,
  type RenamePreviewItem,
} from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { buildEpisodeFilenamePlan } from "@/features/operations/library/naming-canonical-support.ts";
import { selectNamingFormat } from "@/features/operations/library/naming-format-support.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { deriveAnimeSeason, extractYearFromDate } from "@/domain/media/date-utils.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/media/shared/media-read-repository.ts";

export {
  analyzeScannedFile,
  findBestLocalAnimeMatch,
  scoreAnimeRowMatch,
  titlesMatch,
  type AnalyzedFile,
} from "@/features/operations/library/library-import-analysis-support.ts";

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
          message: "Stored media genres are corrupt",
        }),
    ),
  );
});

export const buildRenamePreview = Effect.fn("OperationsService.buildRenamePreview")(function* (
  db: AppDatabase,
  mediaId: number,
  runtimeConfig: Config,
) {
  const animeRow = yield* requireAnime(db, mediaId);
  const namingSettings = {
    movieNamingFormat: runtimeConfig.library.movie_naming_format,
    namingFormat: runtimeConfig.library.naming_format,
    preferredTitle: runtimeConfig.library.preferred_title,
  };
  const namingFormat = selectNamingFormat(animeRow, namingSettings);
  const rows = yield* tryDatabasePromise("Failed to load mediaUnits for rename preview", () =>
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), sql`${mediaUnits.filePath} is not null`)),
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
    const unitNumbers = groupRows.map((r) => r.number).toSorted((a, b) => a - b);
    const [primaryEpisode] = unitNumbers;

    if (primaryEpisode === undefined) {
      continue;
    }

    const extension = filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".")) : ".mkv";
    const plan = buildEpisodeFilenamePlan({
      animeRow,
      unitNumbers,
      episodeRows: groupRows,
      filePath,
      namingFormat,
      preferredTitle: namingSettings.preferredTitle,
    });
    const filename = `${plan.baseName}${extension}`;
    results.push({
      current_path: filePath,
      unit_number: primaryEpisode,
      unit_numbers: unitNumbers.length > 1 ? unitNumbers : undefined,
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
  row: typeof media.$inferSelect,
) {
  return {
    already_in_library: true,
    banner_image: row.bannerImage ?? undefined,
    cover_image: row.coverImage ?? undefined,
    description: row.description ?? undefined,
    duration: row.duration ?? undefined,
    end_date: row.endDate ?? undefined,
    end_year: row.endYear ?? undefined,
    unit_count: row.unitCount ?? undefined,
    favorites: row.favorites ?? undefined,
    format: row.format,
    genres: yield* decodeAnimeGenres(row.genres),
    id: brandMediaId(row.id),
    members: row.members ?? undefined,
    popularity: row.popularity ?? undefined,
    rank: row.rank ?? undefined,
    rating: row.rating ?? undefined,
    season: deriveAnimeSeason(row.startDate),
    season_year: row.startYear ?? extractYearFromDate(row.startDate),
    source: row.source ?? undefined,
    start_date: row.startDate ?? undefined,
    start_year: row.startYear ?? undefined,
    status: row.status,
    title: {
      english: row.titleEnglish ?? undefined,
      native: row.titleNative ?? undefined,
      romaji: row.titleRomaji,
    },
  } satisfies MediaSearchResult;
});
