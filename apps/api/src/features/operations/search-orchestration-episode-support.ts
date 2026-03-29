import { Effect } from "effect";

import type { Config, EpisodeSearchResult } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import { OperationsInputError, type OperationsError } from "./errors.ts";
import {
  loadCurrentEpisodeState,
  loadQualityProfile,
  loadReleaseRules,
  loadRuntimeConfig,
  requireAnime,
} from "./repository.ts";
import { compareEpisodeSearchResults } from "./release-ranking.ts";
import type { ParsedRelease } from "./rss-client.ts";
import { toEpisodeSearchResult } from "./search-orchestration-episode-result.ts";
import { OperationsInfrastructureError } from "./errors.ts";

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
