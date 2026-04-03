import type { Download, DownloadStatus } from "@bakarr/shared";
import { formatReleaseParsedSummary, formatReleaseSourceSummary } from "~/lib/release-metadata";
import { formatSelectionSummary, getReleaseConfidence } from "~/lib/release-selection";

type DownloadLike = Partial<Pick<Download | DownloadStatus, "decision_reason" | "source_metadata">>;

export function formatDownloadParsedMeta(item: DownloadLike) {
  return formatReleaseParsedSummary({
    parsed_air_date: item.source_metadata?.air_date,
    parsed_episode_label: item.source_metadata?.source_identity?.label,
  });
}

export function formatEpisodeCoverage(
  episodeNumber: number,
  coveredEpisodes?: number[],
  coveragePending?: boolean,
) {
  if (coveragePending) {
    return "Batch pending";
  }

  if (!coveredEpisodes || coveredEpisodes.length === 0) {
    return `Ep ${episodeNumber.toString().padStart(2, "0")}`;
  }

  if (coveredEpisodes.length === 1) {
    return `Ep ${coveredEpisodes[0].toString().padStart(2, "0")}`;
  }

  const sorted = [...coveredEpisodes].toSorted((a, b) => a - b);
  return `Batch ${sorted[0].toString().padStart(2, "0")}-${sorted[sorted.length - 1]
    .toString()
    .padStart(2, "0")}`;
}

export function formatCoverageMeta(coveredEpisodes?: number[], coveragePending?: boolean) {
  if (coveragePending) {
    return "Waiting for qBittorrent file metadata";
  }

  if (!coveredEpisodes || coveredEpisodes.length <= 1) {
    return undefined;
  }

  return `${coveredEpisodes.length} episodes: ${coveredEpisodes.join(", ")}`;
}

export function formatDownloadReleaseMeta(input: {
  group?: string;
  indexer?: string;
  quality?: string;
  resolution?: string;
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
  const summary = formatSelectionSummary(item.source_metadata ?? {});
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
  return formatSelectionSummary(item.source_metadata ?? {});
}

export function getDownloadReleaseConfidence(item: DownloadLike) {
  return getReleaseConfidence(item.source_metadata ?? {});
}
