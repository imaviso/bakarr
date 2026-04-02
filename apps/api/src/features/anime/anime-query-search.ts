import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

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

    if (Option.isNone(metadata)) {
      return yield* new AnimeNotFoundError({
        message: "Anime not found",
      });
    }
    const metadataValue = metadata.value;

    const existing = yield* tryDatabasePromise("Failed to check library status", () =>
      input.db.select({ id: anime.id }).from(anime).where(eq(anime.id, input.id)).limit(1),
    );

    return {
      already_in_library: Boolean(existing[0]),
      banner_image: metadataValue.bannerImage,
      cover_image: metadataValue.coverImage,
      description: metadataValue.description,
      end_date: metadataValue.endDate,
      end_year: metadataValue.endYear,
      episode_count: metadataValue.episodeCount,
      format: metadataValue.format,
      genres: metadataValue.genres ? [...metadataValue.genres] : undefined,
      id: metadataValue.id,
      recommended_anime: metadataValue.recommendedAnime
        ? [...metadataValue.recommendedAnime]
        : undefined,
      related_anime: metadataValue.relatedAnime ? [...metadataValue.relatedAnime] : undefined,
      season: deriveAnimeSeason(metadataValue.startDate),
      season_year: metadataValue.startYear,
      start_date: metadataValue.startDate,
      start_year: metadataValue.startYear,
      status: metadataValue.status,
      synonyms: metadataValue.synonyms ? [...metadataValue.synonyms] : undefined,
      title: metadataValue.title,
    } satisfies AnimeSearchResult;
  },
);
