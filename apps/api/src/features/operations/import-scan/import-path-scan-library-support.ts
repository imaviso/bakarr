import { Effect } from "effect";
import { and, eq, inArray, or } from "drizzle-orm";

import { anime, episodes } from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/anime/shared/anime-read-repository.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";

export const loadImportScanAnimeRows = (input: {
  readonly animeId?: number;
  readonly db: AppDatabase;
  readonly tryDatabasePromise: TryDatabasePromise;
}) =>
  input.animeId
    ? Effect.map(requireAnime(input.db, input.animeId), (row) => [row])
    : input.tryDatabasePromise("Failed to scan import path", () => input.db.select().from(anime));

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
      ? inArray(episodes.filePath, [...input.candidatePaths])
      : undefined;
  const byAnimeEpisode =
    input.candidateAnimeIds.length > 0 && input.episodeNumberCandidates.length > 0
      ? and(
          inArray(episodes.animeId, [...input.candidateAnimeIds]),
          inArray(episodes.number, [...input.episodeNumberCandidates]),
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
        anime_id: episodes.animeId,
        anime_title: anime.titleRomaji,
        episode_number: episodes.number,
        file_path: episodes.filePath,
      })
      .from(episodes)
      .innerJoin(anime, eq(episodes.animeId, anime.id));

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
        aired: episodes.aired,
        animeId: episodes.animeId,
        number: episodes.number,
        title: episodes.title,
      })
      .from(episodes)
      .where(
        and(
          inArray(episodes.animeId, [...input.animeIds]),
          inArray(episodes.number, [...input.episodeNumberCandidates]),
        ),
      ),
  );
};
