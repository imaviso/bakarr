import { Context, Effect, Layer, Option } from "effect";

import type { Config, EpisodeSearchResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import {
  isOperationsError,
  OperationsInputError,
  type OperationsError,
} from "@/features/operations/errors.ts";
import { loadCurrentEpisodeState } from "@/features/operations/repository/anime-repository.ts";
import {
  loadQualityProfile,
  loadReleaseRules,
} from "@/features/operations/repository/profile-repository.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { compareEpisodeSearchResults } from "@/features/operations/release-ranking.ts";
import { validateQualityProfileSizeLabels } from "@/features/operations/release-ranking.ts";
import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";
import { toEpisodeSearchResult } from "@/features/operations/search-orchestration-episode-result.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { SearchReleaseService } from "@/features/operations/search-orchestration-release-search.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export interface SearchEpisodeSupportInput {
  readonly db: AppDatabase;
  readonly getRuntimeConfig: () => Effect.Effect<Config, RuntimeConfigSnapshotError>;
  readonly searchEpisodeReleases: (
    animeRow: SearchEpisodeAnimeRow,
    episodeNumber: number,
    config: Config,
  ) => Effect.Effect<readonly ParsedRelease[], ExternalCallError | OperationsError | DatabaseError>;
}

export type SearchEpisodeAnimeRow = typeof anime.$inferSelect;

export interface SearchEpisodeServiceShape {
  readonly searchEpisode: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<EpisodeSearchResult[], OperationsError | RuntimeConfigSnapshotError>;
}

export function makeSearchEpisodeSupport(input: SearchEpisodeSupportInput) {
  const { db, getRuntimeConfig, searchEpisodeReleases } = input;

  const mapSearchEpisodeError = (
    cause: unknown,
  ): ExternalCallError | OperationsError | DatabaseError =>
    cause instanceof DatabaseError || cause instanceof ExternalCallError || isOperationsError(cause)
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
    const runtimeConfig = yield* getRuntimeConfig();
    const profileOption = yield* loadQualityProfile(db, animeRow.profileName);

    if (Option.isNone(profileOption)) {
      return yield* new OperationsInputError({
        message: `Quality profile '${animeRow.profileName}' not found`,
      });
    }

    const profile = profileOption.value;

    yield* validateQualityProfileSizeLabels(profile);

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
      .toSorted(compareEpisodeSearchResults) as EpisodeSearchResult[];
  });

  return {
    searchEpisode,
  } satisfies SearchEpisodeServiceShape;
}

export class SearchEpisodeService extends Context.Tag("@bakarr/api/SearchEpisodeService")<
  SearchEpisodeService,
  SearchEpisodeServiceShape
>() {}

export const SearchEpisodeServiceLive = Layer.effect(
  SearchEpisodeService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const searchReleaseService = yield* SearchReleaseService;
    const runtimeConfigSnapshotService = yield* RuntimeConfigSnapshotService;

    return makeSearchEpisodeSupport({
      db,
      getRuntimeConfig: runtimeConfigSnapshotService.getRuntimeConfig,
      searchEpisodeReleases: searchReleaseService.searchEpisodeReleases,
    });
  }),
);
