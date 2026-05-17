import { Context, Effect, Layer, Option } from "effect";

import type { Config, UnitSearchResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import {
  isOperationsError,
  OperationsInputError,
  type OperationsError,
} from "@/features/operations/errors.ts";
import { loadCurrentEpisodeState } from "@/features/media/shared/media-read-repository.ts";
import {
  loadQualityProfile,
  loadReleaseRules,
} from "@/features/operations/repository/profile-repository.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/media/shared/media-read-repository.ts";
import { compareUnitSearchResults } from "@/features/operations/search/release-ranking.ts";
import { validateQualityProfileSizeLabels } from "@/features/operations/search/release-ranking.ts";
import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import { toUnitSearchResult } from "@/features/operations/search/search-orchestration-unit-result.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { SearchReleaseService } from "@/features/operations/search/search-orchestration-release-search.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export interface SearchUnitSupportInput {
  readonly db: AppDatabase;
  readonly getRuntimeConfig: () => Effect.Effect<Config, RuntimeConfigSnapshotError>;
  readonly searchUnitReleases: (
    animeRow: SearchUnitMediaRow,
    unitNumber: number,
    config: Config,
  ) => Effect.Effect<readonly ParsedRelease[], ExternalCallError | OperationsError | DatabaseError>;
}

export type SearchUnitMediaRow = typeof media.$inferSelect;

export interface SearchUnitServiceShape {
  readonly searchUnit: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<UnitSearchResult[], OperationsError | RuntimeConfigSnapshotError>;
}

export function makeSearchUnitSupport(input: SearchUnitSupportInput) {
  const { db, getRuntimeConfig, searchUnitReleases } = input;

  const mapSearchUnitError = (
    cause: unknown,
  ): ExternalCallError | OperationsError | DatabaseError =>
    cause instanceof DatabaseError || cause instanceof ExternalCallError || isOperationsError(cause)
      ? cause
      : new OperationsInfrastructureError({
          message: "Failed to search unit releases",
          cause,
        });

  const searchUnit = Effect.fn("OperationsService.searchUnit")(function* (
    mediaId: number,
    unitNumber: number,
  ) {
    const animeRow = yield* requireAnime(db, mediaId);
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
    const currentUnit = yield* loadCurrentEpisodeState(db, mediaId, unitNumber);
    const results = yield* searchUnitReleases(animeRow, unitNumber, runtimeConfig).pipe(
      Effect.mapError(mapSearchUnitError),
    );

    return results
      .map((item) =>
        toUnitSearchResult({
          currentUnit,
          item,
          profile,
          rules,
          runtimeConfig,
          unitKind: animeRow.mediaKind === "anime" ? "episode" : "volume",
        }),
      )
      .toSorted(compareUnitSearchResults) as UnitSearchResult[];
  });

  return {
    searchUnit,
  } satisfies SearchUnitServiceShape;
}

export class SearchUnitService extends Context.Tag("@bakarr/api/SearchUnitService")<
  SearchUnitService,
  SearchUnitServiceShape
>() {}

export const SearchUnitServiceLive = Layer.effect(
  SearchUnitService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const searchReleaseService = yield* SearchReleaseService;
    const runtimeConfigSnapshotService = yield* RuntimeConfigSnapshotService;

    return makeSearchUnitSupport({
      db,
      getRuntimeConfig: runtimeConfigSnapshotService.getRuntimeConfig,
      searchUnitReleases: searchReleaseService.searchUnitReleases,
    });
  }),
);
