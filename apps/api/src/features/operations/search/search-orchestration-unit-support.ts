import { Effect, Option } from "effect";

import type { Config, UnitSearchResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { DomainInputError } from "@/features/errors.ts";
import { isOperationsError, type OperationsError } from "@/features/operations/errors.ts";
import { OperationsProfileRepository } from "@/features/operations/repository/profile-repository.ts";
import type { OperationsProfileRepositoryShape } from "@/features/operations/repository/profile-repository.ts";
import { compareUnitSearchResults } from "@/features/operations/search/release-ranking.ts";
import { validateQualityProfileSizeLabels } from "@/features/operations/search/release-ranking.ts";
import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import { toUnitSearchResult } from "@/features/operations/search/search-orchestration-unit-result.ts";
import { InfrastructureError } from "@/features/errors.ts";
import { SearchReleaseService } from "@/features/operations/search/search-orchestration-release-search.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";

export interface SearchUnitSupportInput {
  readonly db: AppDatabase;
  readonly getRuntimeConfig: () => Effect.Effect<Config, RuntimeConfigSnapshotError>;
  readonly mediaReadRepository: typeof MediaReadRepository.Service;
  readonly profileRepository: OperationsProfileRepositoryShape;
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
  const { getRuntimeConfig, mediaReadRepository, profileRepository, searchUnitReleases } = input;

  const mapSearchUnitError = (
    cause: unknown,
  ): ExternalCallError | OperationsError | DatabaseError =>
    cause instanceof DatabaseError || cause instanceof ExternalCallError || isOperationsError(cause)
      ? cause
      : new InfrastructureError({
          message: "Failed to search unit releases",
          cause,
        });

  const searchUnit = Effect.fn("OperationsService.searchUnit")(function* (
    mediaId: number,
    unitNumber: number,
  ) {
    const animeRow = yield* mediaReadRepository.getAnimeRow(mediaId);
    const runtimeConfig = yield* getRuntimeConfig();
    const profileOption = yield* profileRepository.loadQualityProfile(animeRow.profileName);

    if (Option.isNone(profileOption)) {
      return yield* new DomainInputError({
        message: `Quality profile '${animeRow.profileName}' not found`,
      });
    }

    const profile = profileOption.value;

    yield* validateQualityProfileSizeLabels(profile);

    const rules = yield* profileRepository.loadReleaseRules(animeRow);
    const currentUnit = yield* mediaReadRepository.loadCurrentEpisodeState(mediaId, unitNumber);
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

export class SearchUnitService extends Effect.Service<SearchUnitService>()(
  "@bakarr/api/SearchUnitService",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* Database;
      const mediaReadRepository = yield* MediaReadRepository;
      const profileRepository = yield* OperationsProfileRepository;
      const searchReleaseService = yield* SearchReleaseService;
      const runtimeConfigSnapshotService = yield* RuntimeConfigSnapshotService;

      return makeSearchUnitSupport({
        db,
        getRuntimeConfig: runtimeConfigSnapshotService.getRuntimeConfig,
        mediaReadRepository,
        profileRepository,
        searchUnitReleases: searchReleaseService.searchUnitReleases,
      });
    }),
  },
) {}

export const SearchUnitServiceLive = SearchUnitService.Default;
