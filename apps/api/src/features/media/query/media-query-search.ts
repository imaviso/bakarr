import { Effect, Option } from "effect";

import {
  brandMediaId,
  type MediaSearchResponse,
  type MediaSearchResult,
  type MediaKind,
} from "@packages/shared/index.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import type { AniListClient } from "@/features/media/metadata/anilist.ts";
import type { ManamiClient } from "@/features/media/metadata/manami.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/media/query/search-results.ts";
import { annotateMediaSearchResultsForQuery } from "@/features/media/query/media-search-annotation.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import { deriveAnimeSeason } from "@/domain/media/date-utils.ts";

export const searchMediaEffect = Effect.fn("MediaQuerySearch.searchMediaEffect")(function* (input: {
  aniList: typeof AniListClient.Service;
  manami?: Pick<typeof ManamiClient.Service, "searchMedia">;
  mediaKind?: MediaKind;
  mediaRepository: MediaRepositoryShape;
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

            return yield* manami.searchMedia(input.query, 20);
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

        return yield* input.manami.searchMedia(input.query, 20);
      }),
    ),
  );

  const annotated = annotateMediaSearchResultsForQuery(input.query, results);

  const marked = yield* markSearchResultsAlreadyInLibraryEffect(input.mediaRepository, annotated);

  return {
    degraded,
    results: marked,
  } satisfies MediaSearchResponse;
});

export const getMediaByAnilistIdEffect = Effect.fn("MediaQuerySearch.getMediaByAnilistIdEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    id: number;
    mediaKind?: MediaKind;
    mediaRepository: MediaRepositoryShape;
  }) {
    const mediaKind = input.mediaKind ?? "anime";
    const metadata = yield* input.aniList.getAnimeMetadataById(input.id, mediaKind);

    if (Option.isNone(metadata)) {
      return yield* new MediaNotFoundError({
        message: "Media not found",
      });
    }
    const metadataValue = metadata.value;

    const alreadyInLibrary = yield* input.mediaRepository.mediaExists(input.id);

    return {
      already_in_library: alreadyInLibrary,
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
