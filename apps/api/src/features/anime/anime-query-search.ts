import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AnimeSearchResponse, AnimeSearchResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { AnimeNotFoundError } from "@/features/anime/errors.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/lib/anime-search-results.ts";
import { annotateAnimeSearchResultsForQuery } from "@/features/anime/anime-search-annotation.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { deriveAnimeSeason } from "@/lib/anime-date-utils.ts";

export const searchAnimeEffect = Effect.fn("AnimeQuerySearch.searchAnimeEffect")(function* (input: {
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

export const getAnimeByAnilistIdEffect = Effect.fn("AnimeQuerySearch.getAnimeByAnilistIdEffect")(
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
