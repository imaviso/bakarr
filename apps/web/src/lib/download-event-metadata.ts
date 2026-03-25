import type { DownloadEvent } from "@bakarr/shared";
import { formatDownloadDecisionSummary, formatDownloadParsedMeta } from "~/lib/download-metadata";
import { formatReleaseSourceSummary } from "~/lib/release-metadata";

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

  return {
    coverage: formatDownloadEventCoverage(input.metadata_json?.covered_episodes),
    decision: formatDownloadDecisionSummary({
      decision_reason: sourceMetadata?.decision_reason,
      source_metadata: sourceMetadata,
    }),
    importedPath: input.metadata_json?.imported_path,
    parsed: formatDownloadParsedMeta({ source_metadata: sourceMetadata }),
    source: formatReleaseSourceSummary({
      group: sourceMetadata?.group,
      indexer: sourceMetadata?.indexer,
      quality: sourceMetadata?.quality,
      resolution: sourceMetadata?.resolution,
    }),
  };
}
