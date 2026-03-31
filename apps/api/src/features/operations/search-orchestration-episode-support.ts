import { Context, Effect, Layer } from "effect";

import type { Config, EpisodeSearchResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import { OperationsInputError, type OperationsError } from "@/features/operations/errors.ts";
import { loadCurrentEpisodeState } from "@/features/operations/repository/anime-repository.ts";
import {
  loadQualityProfile,
  loadReleaseRules,
} from "@/features/operations/repository/profile-repository.ts";
import { loadRuntimeConfig } from "@/features/operations/repository/config-repository.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { compareEpisodeSearchResults } from "@/features/operations/release-ranking.ts";
import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";
import { toEpisodeSearchResult } from "@/features/operations/search-orchestration-episode-result.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { SearchReleaseService } from "@/features/operations/search-orchestration-release-search.ts";

export interface SearchEpisodeSupportInput {
  readonly db: AppDatabase;
  readonly searchEpisodeReleases: (
    animeRow: SearchEpisodeAnimeRow,
    episodeNumber: number,
    config: Config,
  ) => Effect.Effect<readonly ParsedRelease[], ExternalCallError | OperationsError | DatabaseError>;
}

export type SearchEpisodeAnimeRow = typeof anime.$inferSelect;

export function makeSearchEpisodeSupport(input: SearchEpisodeSupportInput) {
  const { db, searchEpisodeReleases } = input;

  const mapSearchEpisodeError = (
    cause: unknown,
  ): ExternalCallError | OperationsError | DatabaseError =>
    cause instanceof DatabaseError || cause instanceof ExternalCallError
      ? cause
      : new OperationsInfrastructureError({
          message: "Failed to search episode releases",
          cause,
        });

  const searchEpisode = Effect.fn("OperationsService.searchEpisode")(function* (
    animeId: number,
    episodeNumber: number,
  ) {
    const animeRow = yield* requireAnime(db, animeId);
    const runtimeConfig = yield* loadRuntimeConfig(db);
    const profile = yield* loadQualityProfile(db, animeRow.profileName);

    if (!profile) {
      return yield* new OperationsInputError({
        message: `Quality profile '${animeRow.profileName}' not found`,
      });
    }

    const rules = yield* loadReleaseRules(db, animeRow);
    const currentEpisode = yield* loadCurrentEpisodeState(db, animeId, episodeNumber);
    const results = yield* searchEpisodeReleases(animeRow, episodeNumber, runtimeConfig).pipe(
      Effect.mapError(mapSearchEpisodeError),
    );

    return results
      .map((item) =>
        toEpisodeSearchResult({
          currentEpisode,
          item,
          profile,
          rules,
          runtimeConfig,
        }),
      )
      .sort(compareEpisodeSearchResults) as EpisodeSearchResult[];
  });

  return {
    searchEpisode,
  };
}

export type SearchEpisodeServiceShape = ReturnType<typeof makeSearchEpisodeSupport>;

export class SearchEpisodeService extends Context.Tag("@bakarr/api/SearchEpisodeService")<
  SearchEpisodeService,
  SearchEpisodeServiceShape
>() {}

export const SearchEpisodeServiceLive = Layer.effect(
  SearchEpisodeService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const searchReleaseService = yield* SearchReleaseService;

    return makeSearchEpisodeSupport({
      db,
      searchEpisodeReleases: searchReleaseService.searchEpisodeReleases,
    });
  }),
);
