import type { DownloadAction, UnitSearchResult, QualityProfile } from "@packages/shared/index.ts";

export { decideDownloadAction } from "@/features/operations/search/release-ranking-action.ts";
import { DomainInputError } from "@/features/errors.ts";
import { parseReleaseName } from "@/features/operations/search/release-ranking-parse.ts";
import { parseSizeLabelToBytes } from "@/features/operations/search/release-ranking-size.ts";
import { parseVolumeNumbersFromTitle } from "@/features/operations/search/release-volume.ts";
import { Effect, Option, Result } from "effect";

export const validateQualityProfileSizeLabels = Effect.fn(
  "Operations.validateQualityProfileSizeLabels",
)(function* (profile: QualityProfile) {
  const minSizeBytesResult = parseSizeLabelToBytes(profile.min_size);

  if (Result.isFailure(minSizeBytesResult)) {
    return yield* Effect.fail(minSizeBytesResult.failure);
  }

  const maxSizeBytesResult = parseSizeLabelToBytes(profile.max_size);

  if (Result.isFailure(maxSizeBytesResult)) {
    return yield* Effect.fail(maxSizeBytesResult.failure);
  }

  const minSizeOption = minSizeBytesResult.success;
  const maxSizeOption = maxSizeBytesResult.success;

  if (
    Option.isSome(minSizeOption) &&
    Option.isSome(maxSizeOption) &&
    minSizeOption.value > maxSizeOption.value
  ) {
    return yield* Effect.fail(
      new DomainInputError({
        message: "Quality profile min_size cannot exceed max_size",
      }),
    );
  }

  return undefined;
});

export function compareUnitSearchResults(left: UnitSearchResult, right: UnitSearchResult): number {
  return (
    actionWeight(right.download_action) - actionWeight(left.download_action) ||
    batchPenalty(left) - batchPenalty(right) ||
    actionScore(right.download_action) - actionScore(left.download_action) ||
    actionQualityRank(left.download_action) - actionQualityRank(right.download_action) ||
    right.seeders - left.seeders ||
    right.size - left.size
  );
}

function batchPenalty(result: UnitSearchResult): number {
  if ((result.parsed_unit_numbers?.length ?? 0) > 1) {
    return 1;
  }

  if (parseReleaseName(result.title).isBatch) {
    return 1;
  }

  return parseVolumeNumbersFromTitle(result.title).length > 1 ? 1 : 0;
}

function actionWeight(action: DownloadAction): number {
  if (action.Accept) return 3;
  if (action.Upgrade) return 2;
  return 1;
}

function actionScore(action: DownloadAction): number {
  return action.Accept?.score ?? action.Upgrade?.score ?? globalThis.Number.NEGATIVE_INFINITY;
}

function actionQualityRank(action: DownloadAction): number {
  return (
    action.Accept?.quality.rank ??
    action.Upgrade?.quality.rank ??
    globalThis.Number.POSITIVE_INFINITY
  );
}
