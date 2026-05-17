import { Effect } from "effect";
import { and, eq, inArray, or } from "drizzle-orm";

import { media, mediaUnits } from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/media/shared/media-read-repository.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";

export const loadImportScanAnimeRows = (input: {
  readonly mediaId?: number;
  readonly db: AppDatabase;
  readonly tryDatabasePromise: TryDatabasePromise;
}) =>
  input.mediaId
    ? Effect.map(requireAnime(input.db, input.mediaId), (row) => [row])
    : input.tryDatabasePromise("Failed to scan import path", () => input.db.select().from(media));

export const loadMappedEpisodeRows = (input: {
  readonly candidateAnimeIds: readonly number[];
  readonly candidatePaths: readonly string[];
  readonly db: AppDatabase;
  readonly episodeNumberCandidates: readonly number[];
  readonly tryDatabasePromise: TryDatabasePromise;
}) => {
  if (
    input.candidatePaths.length === 0 &&
    (input.candidateAnimeIds.length === 0 || input.episodeNumberCandidates.length === 0)
  ) {
    return Effect.succeed([] as const);
  }

  const byPath =
    input.candidatePaths.length > 0
      ? inArray(mediaUnits.filePath, [...input.candidatePaths])
      : undefined;
  const byAnimeEpisode =
    input.candidateAnimeIds.length > 0 && input.episodeNumberCandidates.length > 0
      ? and(
          inArray(mediaUnits.mediaId, [...input.candidateAnimeIds]),
          inArray(mediaUnits.number, [...input.episodeNumberCandidates]),
        )
      : undefined;
  const whereClause =
    byPath && byAnimeEpisode ? or(byPath, byAnimeEpisode) : (byPath ?? byAnimeEpisode);

  if (!whereClause) {
    return Effect.succeed([] as const);
  }

  return input.tryDatabasePromise("Failed to scan import path", () => {
    const query = input.db
      .select({
        media_id: mediaUnits.mediaId,
        media_title: media.titleRomaji,
        unit_number: mediaUnits.number,
        file_path: mediaUnits.filePath,
      })
      .from(mediaUnits)
      .innerJoin(media, eq(mediaUnits.mediaId, media.id));

    return query.where(whereClause);
  });
};

export const loadScopedEpisodeRows = (input: {
  readonly animeIds: readonly number[];
  readonly db: AppDatabase;
  readonly episodeNumberCandidates: readonly number[];
  readonly tryDatabasePromise: TryDatabasePromise;
}) => {
  if (input.animeIds.length === 0 || input.episodeNumberCandidates.length === 0) {
    return Effect.succeed([] as const);
  }

  return input.tryDatabasePromise("Failed to scan import path", () =>
    input.db
      .select({
        aired: mediaUnits.aired,
        mediaId: mediaUnits.mediaId,
        number: mediaUnits.number,
        title: mediaUnits.title,
      })
      .from(mediaUnits)
      .where(
        and(
          inArray(mediaUnits.mediaId, [...input.animeIds]),
          inArray(mediaUnits.number, [...input.episodeNumberCandidates]),
        ),
      ),
  );
};
