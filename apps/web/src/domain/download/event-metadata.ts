import type { DownloadEvent } from "@bakarr/shared";
import {
  formatDownloadDecisionSummary,
  formatDownloadParsedMeta,
} from "@/domain/download/metadata";
import {
  buildReleaseSourceSummaryInput,
  formatReleaseSourceSummary,
} from "@/domain/release/metadata";
import { inferBatchKind } from "@/domain/batch-kind";

type DownloadEventLike = Pick<DownloadEvent, "metadata_json">;

export function formatDownloadEventCoverage(coveredUnits?: readonly number[]) {
  if (!coveredUnits?.length) {
    return undefined;
  }

  return coveredUnits.length === 1
    ? `MediaUnit ${coveredUnits[0]}`
    : `Episodes ${coveredUnits.join(", ")}`;
}

export function getDownloadEventMetadataSummary(input: DownloadEventLike) {
  const sourceMetadata = input.metadata_json?.source_metadata;
  const coveredUnits = input.metadata_json?.covered_units;
  const isBatch =
    inferBatchKind({ coveredUnits, sourceIdentity: sourceMetadata?.source_identity }) !== undefined;

  const sourceSummaryInput = buildReleaseSourceSummaryInput(sourceMetadata ?? undefined);

  return {
    coverage: formatDownloadEventCoverage(coveredUnits ?? undefined),
    decision: formatDownloadDecisionSummary({
      covered_units: coveredUnits,
      decision_reason: sourceMetadata?.decision_reason,
      is_batch: isBatch,
      source_metadata: sourceMetadata,
    }),
    importedPath: input.metadata_json?.imported_path,
    parsed: formatDownloadParsedMeta({ source_metadata: sourceMetadata }),
    source: formatReleaseSourceSummary(sourceSummaryInput),
  };
}
