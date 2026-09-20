import type { Download, DownloadStatus } from "@bakarr/shared";
import { formatReleaseParsedSummary, formatReleaseSourceSummary } from "@/domain/release/metadata";
import { formatSelectionSummary, getReleaseConfidence } from "@/domain/release/selection";

type DownloadLike = Partial<Pick<Download | DownloadStatus, "decision_reason" | "source_metadata">>;

export function formatDownloadParsedMeta(item: DownloadLike) {
  return formatReleaseParsedSummary({
    parsed_air_date: item.source_metadata?.air_date,
    parsed_unit_label: item.source_metadata?.source_identity?.label,
  });
}

export function formatEpisodeCoverage(
  unitNumber: number,
  coveredUnits?: number[] | null,
  coveragePending?: boolean | null,
) {
  if (coveragePending) {
    return "Batch pending";
  }

  if (!coveredUnits || coveredUnits.length === 0) {
    return `Ep ${unitNumber.toString().padStart(2, "0")}`;
  }

  if (coveredUnits.length === 1) {
    const first = coveredUnits[0];
    if (first === undefined) {
      return `Ep ${unitNumber.toString().padStart(2, "0")}`;
    }
    return `Ep ${first.toString().padStart(2, "0")}`;
  }

  const sorted = [...coveredUnits].toSorted((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) {
    return `Ep ${unitNumber.toString().padStart(2, "0")}`;
  }
  return `Batch ${first.toString().padStart(2, "0")}-${last.toString().padStart(2, "0")}`;
}

export function formatCoverageMeta(
  coveredUnits?: number[] | null,
  coveragePending?: boolean | null,
) {
  if (coveragePending) {
    return "Waiting for qBittorrent file metadata";
  }

  if (!coveredUnits || coveredUnits.length <= 1) {
    return undefined;
  }

  return `${coveredUnits.length} episodes: ${coveredUnits.join(", ")}`;
}

export function formatDownloadReleaseMeta(input: {
  group?: string | undefined;
  indexer?: string | undefined;
  quality?: string | undefined;
  resolution?: string | undefined;
}) {
  return formatReleaseSourceSummary(input) ?? "";
}

export function formatDownloadDecisionBadge(item: DownloadLike) {
  if (item.source_metadata?.is_seadex_best) {
    return "SeaDex Best";
  }

  if (item.source_metadata?.is_seadex) {
    return "SeaDex";
  }

  if (item.decision_reason?.toLowerCase().includes("upgrade")) {
    return "Upgrade";
  }

  return undefined;
}

export function formatDownloadDecisionSummary(item: DownloadLike) {
  const summary = formatSelectionSummary({
    previous_quality: item.source_metadata?.previous_quality,
    previous_score: item.source_metadata?.previous_score,
    selection_kind: item.source_metadata?.selection_kind,
    selection_score: item.source_metadata?.selection_score,
  });
  const reason = item.decision_reason;

  if (!summary) {
    return reason;
  }

  if (!reason) {
    return summary;
  }

  const normalizedReason = reason.toLowerCase();
  const normalizedSummary = summary.toLowerCase();

  if (normalizedReason.includes(normalizedSummary)) {
    return reason;
  }

  return `${summary} • ${reason}`;
}

export function formatDownloadRankingMeta(item: DownloadLike) {
  return formatSelectionSummary({
    previous_quality: item.source_metadata?.previous_quality,
    previous_score: item.source_metadata?.previous_score,
    selection_kind: item.source_metadata?.selection_kind,
    selection_score: item.source_metadata?.selection_score,
  });
}

export function getDownloadReleaseConfidence(item: DownloadLike) {
  const sourceMetadata = item.source_metadata;
  return getReleaseConfidence({
    ...(sourceMetadata?.is_seadex == null ? {} : { is_seadex: sourceMetadata.is_seadex }),
    ...(sourceMetadata?.is_seadex_best == null
      ? {}
      : { is_seadex_best: sourceMetadata.is_seadex_best }),
    ...(sourceMetadata?.remake == null ? {} : { remake: sourceMetadata.remake }),
    ...(sourceMetadata?.trusted == null ? {} : { trusted: sourceMetadata.trusted }),
  });
}
