import { Effect, Either, Option } from "effect";

import type {
  DownloadAction,
  EpisodeSearchResult,
  QualityProfile,
} from "@packages/shared/index.ts";

export { decideDownloadAction } from "@/features/operations/search/release-ranking-action.ts";
import { OperationsInputError } from "@/features/operations/errors.ts";
import { parseSizeLabelToBytes } from "@/features/operations/search/release-ranking-size.ts";

export const validateQualityProfileSizeLabels = Effect.fn(
  "Operations.validateQualityProfileSizeLabels",
)(function* (profile: QualityProfile) {
  const minSizeBytesResult = parseSizeLabelToBytes(profile.min_size);

  if (Either.isLeft(minSizeBytesResult)) {
    return yield* minSizeBytesResult.left;
  }

  const maxSizeBytesResult = parseSizeLabelToBytes(profile.max_size);

  if (Either.isLeft(maxSizeBytesResult)) {
    return yield* maxSizeBytesResult.left;
  }

  const minSizeOption = minSizeBytesResult.right;
  const maxSizeOption = maxSizeBytesResult.right;

  if (
    Option.isSome(minSizeOption) &&
    Option.isSome(maxSizeOption) &&
    minSizeOption.value > maxSizeOption.value
  ) {
    return yield* new OperationsInputError({
      message: "Quality profile min_size cannot exceed max_size",
    });
  }

  return undefined;
});

export function compareEpisodeSearchResults(
  left: EpisodeSearchResult,
  right: EpisodeSearchResult,
): number {
  return (
    actionWeight(right.download_action) - actionWeight(left.download_action) ||
    actionScore(right.download_action) - actionScore(left.download_action) ||
    actionQualityRank(left.download_action) - actionQualityRank(right.download_action) ||
    right.seeders - left.seeders ||
    right.size - left.size
  );
}

function actionWeight(action: DownloadAction): number {
  if (action.Accept) return 3;
  if (action.Upgrade) return 2;
  return 1;
}

function actionScore(action: DownloadAction): number {
  return action.Accept?.score ?? action.Upgrade?.score ?? Number.NEGATIVE_INFINITY;
}

function actionQualityRank(action: DownloadAction): number {
  return action.Accept?.quality.rank ?? action.Upgrade?.quality.rank ?? Number.POSITIVE_INFINITY;
}
