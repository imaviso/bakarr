import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import {
  brandAnimeId,
  type AnimeSearchResponse,
  type AnimeSearchResult,
} from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { AnimeNotFoundError } from "@/features/anime/errors.ts";
import type { AniListClient } from "@/features/anime/metadata/anilist.ts";
import type { ManamiClient } from "@/features/anime/metadata/manami.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/anime/query/search-results.ts";
import { annotateAnimeSearchResultsForQuery } from "@/features/anime/query/anime-search-annotation.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { deriveAnimeSeason } from "@/domain/anime/date-utils.ts";

export const searchAnimeEffect = Effect.fn("AnimeQuerySearch.searchAnimeEffect")(function* (input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  manami?: Pick<typeof ManamiClient.Service, "searchAnime">;
  query: string;
}) {
  let degraded = false;
  const results = yield* input.aniList.searchAnimeMetadata(input.query).pipe(
    Effect.flatMap((results) => {
      const manami = input.manami;
      return results.length === 0 && manami !== undefined
        ? Effect.gen(function* () {
            degraded = true;

            yield* Effect.logWarning(
              "AniList search returned no results; using Manami fallback",
            ).pipe(
              Effect.annotateLogs({
                provider: "Manami",
                queryLength: input.query.length,
              }),
            );

            return yield* manami.searchAnime(input.query, 20);
          })
        : Effect.succeed(results);
    }),
    Effect.catchTag("ExternalCallError", (error) =>
      Effect.gen(function* () {
        if (input.manami === undefined) {
          return yield* error;
        }

        degraded = true;

        yield* Effect.logWarning("AniList search failed; using Manami fallback").pipe(
          Effect.annotateLogs({
            operation: error.operation,
            provider: "Manami",
            queryLength: input.query.length,
          }),
        );

        return yield* input.manami.searchAnime(input.query, 20);
      }),
    ),
  );

  const annotated = annotateAnimeSearchResultsForQuery(input.query, results);

  const marked = yield* markSearchResultsAlreadyInLibraryEffect(input.db, annotated);

  return {
    degraded,
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
      duration: metadataValue.duration,
      end_date: metadataValue.endDate,
      end_year: metadataValue.endYear,
      episode_count: metadataValue.episodeCount,
      favorites: metadataValue.favorites,
      format: metadataValue.format,
      genres: metadataValue.genres ? [...metadataValue.genres] : undefined,
      id: brandAnimeId(metadataValue.id),
      members: metadataValue.members,
      popularity: metadataValue.popularity,
      rank: metadataValue.rank,
      rating: metadataValue.rating,
      recommended_anime: metadataValue.recommendedAnime
        ? [...metadataValue.recommendedAnime]
        : undefined,
      related_anime: metadataValue.relatedAnime ? [...metadataValue.relatedAnime] : undefined,
      season: deriveAnimeSeason(metadataValue.startDate),
      season_year: metadataValue.startYear,
      source: metadataValue.source,
      start_date: metadataValue.startDate,
      start_year: metadataValue.startYear,
      status: metadataValue.status,
      synonyms: metadataValue.synonyms ? [...metadataValue.synonyms] : undefined,
      title: metadataValue.title,
    } satisfies AnimeSearchResult;
  },
);
