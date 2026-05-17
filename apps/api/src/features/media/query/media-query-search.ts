import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import {
  brandMediaId,
  type MediaSearchResponse,
  type MediaSearchResult,
  type MediaKind,
} from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import type { AniListClient } from "@/features/media/metadata/anilist.ts";
import type { ManamiClient } from "@/features/media/metadata/manami.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/media/query/search-results.ts";
import { annotateAnimeSearchResultsForQuery } from "@/features/media/query/media-search-annotation.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { deriveAnimeSeason } from "@/domain/media/date-utils.ts";

export const searchAnimeEffect = Effect.fn("AnimeQuerySearch.searchAnimeEffect")(function* (input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  manami?: Pick<typeof ManamiClient.Service, "searchAnime">;
  mediaKind?: MediaKind;
  query: string;
}) {
  const mediaKind = input.mediaKind ?? "anime";
  let degraded = false;
  const results = yield* input.aniList.searchAnimeMetadata(input.query, mediaKind).pipe(
    Effect.flatMap((results) => {
      const manami = mediaKind === "anime" ? input.manami : undefined;
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
        if (input.manami === undefined || mediaKind !== "anime") {
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
  } satisfies MediaSearchResponse;
});

export const getAnimeByAnilistIdEffect = Effect.fn("AnimeQuerySearch.getAnimeByAnilistIdEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    db: AppDatabase;
    id: number;
    mediaKind?: MediaKind;
  }) {
    const mediaKind = input.mediaKind ?? "anime";
    const metadata = yield* input.aniList.getAnimeMetadataById(input.id, mediaKind);

    if (Option.isNone(metadata)) {
      return yield* new MediaNotFoundError({
        message: "Media not found",
      });
    }
    const metadataValue = metadata.value;

    const existing = yield* tryDatabasePromise("Failed to check library status", () =>
      input.db.select({ id: media.id }).from(media).where(eq(media.id, input.id)).limit(1),
    );

    return {
      already_in_library: Boolean(existing[0]),
      banner_image: metadataValue.bannerImage,
      cover_image: metadataValue.coverImage,
      description: metadataValue.description,
      duration: metadataValue.duration,
      end_date: metadataValue.endDate,
      end_year: metadataValue.endYear,
      unit_count: metadataValue.unitCount,
      favorites: metadataValue.favorites,
      format: metadataValue.format,
      genres: metadataValue.genres ? [...metadataValue.genres] : undefined,
      id: brandMediaId(metadataValue.id),
      media_kind: mediaKind,
      members: metadataValue.members,
      popularity: metadataValue.popularity,
      rank: metadataValue.rank,
      rating: metadataValue.rating,
      recommended_media: metadataValue.recommendedMedia
        ? [...metadataValue.recommendedMedia]
        : undefined,
      related_media: metadataValue.relatedMedia ? [...metadataValue.relatedMedia] : undefined,
      season: deriveAnimeSeason(metadataValue.startDate),
      season_year: metadataValue.startYear,
      source: metadataValue.source,
      start_date: metadataValue.startDate,
      start_year: metadataValue.startYear,
      status: metadataValue.status,
      synonyms: metadataValue.synonyms ? [...metadataValue.synonyms] : undefined,
      title: metadataValue.title,
    } satisfies MediaSearchResult;
  },
);
