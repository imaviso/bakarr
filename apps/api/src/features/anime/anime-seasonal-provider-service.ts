import { Context, Effect, Layer, Option } from "effect";

import { brandAnimeId, type AnimeSearchResult, type AnimeSeason } from "@packages/shared/index.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { JikanClient } from "@/features/anime/jikan.ts";
import type { JikanNormalizedSeasonalEntry } from "@/features/anime/jikan-model.ts";
import { ManamiClient } from "@/features/anime/manami.ts";

export interface AnimeSeasonalResult {
  readonly provider: "anilist" | "jikan_fallback";
  readonly degraded: boolean;
  readonly hasMore: boolean;
  readonly results: ReadonlyArray<AnimeSearchResult>;
  readonly season: AnimeSeason;
  readonly year: number;
}

export interface AnimeSeasonalProviderServiceShape {
  readonly getSeasonalAnime: (input: {
    season: AnimeSeason;
    year: number;
    limit: number;
    page: number;
  }) => Effect.Effect<AnimeSeasonalResult, ExternalCallError>;
}

export class AnimeSeasonalProviderService extends Context.Tag(
  "@bakarr/api/AnimeSeasonalProviderService",
)<AnimeSeasonalProviderService, AnimeSeasonalProviderServiceShape>() {}

function toAnimeSeason(value: string | undefined): AnimeSeason | undefined {
  if (value === "winter" || value === "spring" || value === "summer" || value === "fall") {
    return value;
  }

  return undefined;
}

function mapJikanEntryToSearchResult(
  entry: JikanNormalizedSeasonalEntry,
  anilistId: number,
  fallbackSeason: AnimeSeason,
  fallbackYear: number,
): AnimeSearchResult {
  const season = toAnimeSeason(entry.season) ?? fallbackSeason;
  const seasonYear = entry.seasonYear ?? fallbackYear;
  const startYear = entry.startYear ?? seasonYear;

  return {
    already_in_library: false,
    cover_image: entry.coverImage,
    episode_count: entry.episodeCount,
    format: entry.format,
    genres: entry.genres ? [...entry.genres] : undefined,
    id: brandAnimeId(anilistId),
    season,
    season_year: seasonYear,
    start_year: startYear,
    status: entry.status,
    title: {
      english: entry.title.english,
      native: entry.title.native,
      romaji: entry.title.romaji,
    },
  };
}

function shouldFallbackToJikan(error: ExternalCallError) {
  return error.operation === "anilist.seasonal" || error.operation === "anilist.seasonal.response";
}

export const AnimeSeasonalProviderServiceLive = Layer.effect(
  AnimeSeasonalProviderService,
  Effect.gen(function* () {
    const aniList = yield* AniListClient;
    const jikan = yield* JikanClient;
    const manami = yield* ManamiClient;

    const getSeasonalAnime = Effect.fn("AnimeSeasonalProviderService.getSeasonalAnime")(
      function* (input: { season: AnimeSeason; year: number; limit: number; page: number }) {
        const anilistAttempt = yield* aniList
          .getSeasonalAnime({
            page: input.page,
            season: input.season,
            year: input.year,
            limit: input.limit,
          })
          .pipe(Effect.either);

        if (anilistAttempt._tag === "Right") {
          return {
            degraded: false,
            hasMore: anilistAttempt.right.length === input.limit,
            provider: "anilist" as const,
            results: anilistAttempt.right,
            season: input.season,
            year: input.year,
          } satisfies AnimeSeasonalResult;
        }

        if (!shouldFallbackToJikan(anilistAttempt.left)) {
          return yield* anilistAttempt.left;
        }

        yield* Effect.logWarning("AniList seasonal request failed; using Jikan fallback").pipe(
          Effect.annotateLogs({
            causeTag: anilistAttempt.left._tag,
            operation: anilistAttempt.left.operation,
            season: input.season,
            year: input.year,
          }),
        );

        const jikanEntries = yield* jikan.getSeasonalAnime({
          limit: input.limit,
          page: input.page,
          season: input.season,
          year: input.year,
        });

        const mappedEntries = yield* Effect.forEach(jikanEntries, (entry) =>
          manami
            .resolveAniListIdFromMalId(entry.malId)
            .pipe(Effect.map((anilistIdOption) => [entry, anilistIdOption] as const)),
        );

        const results: Array<AnimeSearchResult> = [];

        for (const [entry, anilistIdOption] of mappedEntries) {
          if (Option.isSome(anilistIdOption)) {
            results.push(
              mapJikanEntryToSearchResult(entry, anilistIdOption.value, input.season, input.year),
            );
          }
        }

        return {
          degraded: true,
          hasMore: jikanEntries.length === input.limit,
          provider: "jikan_fallback" as const,
          results,
          season: input.season,
          year: input.year,
        } satisfies AnimeSeasonalResult;
      },
    );

    return AnimeSeasonalProviderService.of({ getSeasonalAnime });
  }),
);
