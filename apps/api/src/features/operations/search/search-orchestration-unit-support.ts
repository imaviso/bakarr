import { Effect, Option } from "effect";

import type { UnitSearchResult } from "@packages/shared/index.ts";
import { media } from "@/db/schema.ts";
import type { DatabaseError } from "@/db/database.ts";
import { DomainInputError } from "@/features/errors.ts";
import {
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";
import { OperationsProfileRepository } from "@/features/operations/repository/profile-repository.ts";
import { compareUnitSearchResults } from "@/features/operations/search/release-ranking.ts";
import { validateQualityProfileSizeLabels } from "@/features/operations/search/release-ranking.ts";
import { toUnitSearchResult } from "@/features/operations/search/search-orchestration-unit-result.ts";
import { SearchReleaseService } from "@/features/operations/search/search-orchestration-release-search.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";

export type SearchUnitMediaRow = typeof media.$inferSelect;

export type SearchUnitError =
  | DatabaseError
  | MediaNotFoundError
  | DomainInputError
  | RuntimeConfigSnapshotError
  | ExternalCallError
  | RssFeedParseError
  | RssFeedRejectedError
  | RssFeedTooLargeError;

export interface SearchUnitServiceShape {
  readonly searchUnit: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<UnitSearchResult[], SearchUnitError>;
}

export class SearchUnitService extends Effect.Service<SearchUnitService>()(
  "@bakarr/api/SearchUnitService",
  {
    effect: Effect.gen(function* () {
      const mediaReadRepository = yield* MediaReadRepository;
      const profileRepository = yield* OperationsProfileRepository;
      const searchReleaseService = yield* SearchReleaseService;
      const runtimeConfigSnapshotService = yield* RuntimeConfigSnapshotService;

      const searchUnit = Effect.fn("SearchUnit.searchUnit")(function* (
        mediaId: number,
        unitNumber: number,
      ) {
        const animeRow = yield* mediaReadRepository.getMediaRow(mediaId);
        const runtimeConfig = yield* runtimeConfigSnapshotService.getRuntimeConfig();
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
        const results = yield* searchReleaseService.searchUnitReleases(
          animeRow,
          unitNumber,
          runtimeConfig,
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
    }),
    dependencies: [
      MediaReadRepository.Default,
      OperationsProfileRepository.Default,
      SearchReleaseService.Default,
    ],
  },
) {}

export const SearchUnitServiceLive = SearchUnitService.Default;
