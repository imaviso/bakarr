import type { DownloadEvent } from "@bakarr/shared";
import { formatDownloadDecisionSummary, formatDownloadParsedMeta } from "~/lib/download-metadata";
import { buildReleaseSourceSummaryInput, formatReleaseSourceSummary } from "~/lib/release-metadata";

type DownloadEventLike = Pick<DownloadEvent, "metadata_json">;

export function formatDownloadEventCoverage(coveredEpisodes?: readonly number[]) {
  if (!coveredEpisodes?.length) {
    return undefined;
  }

  return coveredEpisodes.length === 1
    ? `Episode ${coveredEpisodes[0]}`
    : `Episodes ${coveredEpisodes.join(", ")}`;
}

export function getDownloadEventMetadataSummary(input: DownloadEventLike) {
  const sourceMetadata = input.metadata_json?.source_metadata;
  const coveredEpisodes = input.metadata_json?.covered_episodes;
  const inferredBatch =
    (coveredEpisodes?.length ?? 0) > 1 ||
    (sourceMetadata?.source_identity?.scheme !== "daily" &&
      (sourceMetadata?.source_identity?.episode_numbers?.length ?? 0) > 1) ||
    sourceMetadata?.source_identity?.scheme === "season";

  const sourceSummaryInput = buildReleaseSourceSummaryInput(sourceMetadata);

  return {
    coverage: formatDownloadEventCoverage(coveredEpisodes),
    decision: formatDownloadDecisionSummary({
      covered_episodes: coveredEpisodes,
      decision_reason: sourceMetadata?.decision_reason,
      is_batch: inferredBatch,
      source_metadata: sourceMetadata,
    }),
    importedPath: input.metadata_json?.imported_path,
    parsed: formatDownloadParsedMeta({ source_metadata: sourceMetadata }),
    source: formatReleaseSourceSummary(sourceSummaryInput),
  };
}
