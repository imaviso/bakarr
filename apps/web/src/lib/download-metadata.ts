import type { Download, DownloadStatus } from "@bakarr/shared";
import { formatManualReleaseSearchDecisionReason, inferBatchKind } from "~/lib/batch-kind";
import { formatReleaseParsedSummary, formatReleaseSourceSummary } from "~/lib/release-metadata";
import { formatSelectionSummary, getReleaseConfidence } from "~/lib/release-selection";

type DownloadLike = Partial<
  Pick<
    Download | DownloadStatus,
    "covered_episodes" | "decision_reason" | "is_batch" | "source_metadata"
  >
>;

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
    const first = coveredEpisodes[0];
    if (first === undefined) {
      return `Ep ${episodeNumber.toString().padStart(2, "0")}`;
    }
    return `Ep ${first.toString().padStart(2, "0")}`;
  }

  const sorted = [...coveredEpisodes].toSorted((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) {
    return `Ep ${episodeNumber.toString().padStart(2, "0")}`;
  }
  return `Batch ${first.toString().padStart(2, "0")}-${last.toString().padStart(2, "0")}`;
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
  const summary = formatSelectionSummary(item.source_metadata ?? {});
  const reason = normalizeLegacyManualDecisionReason(item) ?? item.decision_reason;

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

function normalizeLegacyManualDecisionReason(item: DownloadLike) {
  const reason = item.decision_reason;

  if (!reason) {
    return undefined;
  }

  const normalizedReason = reason.toLowerCase();
  const isLegacyManualReason =
    normalizedReason === "manual grab from release search" ||
    normalizedReason === "manual grab from trusted release search";

  if (!isLegacyManualReason) {
    return reason;
  }

  const batchKind = inferBatchKind({
    coveredEpisodes: item.covered_episodes,
    isBatch: item.is_batch,
    sourceIdentity: item.source_metadata?.source_identity,
  });

  if (!batchKind) {
    return reason;
  }

  const trusted = normalizedReason.includes("trusted") || item.source_metadata?.trusted;
  return formatManualReleaseSearchDecisionReason({
    batchKind,
    trusted,
  });
}

export function formatDownloadRankingMeta(item: DownloadLike) {
  return formatSelectionSummary(item.source_metadata ?? {});
}

export function getDownloadReleaseConfidence(item: DownloadLike) {
  const sourceMetadata = item.source_metadata;
  return getReleaseConfidence({
    ...(sourceMetadata?.is_seadex === undefined ? {} : { is_seadex: sourceMetadata.is_seadex }),
    ...(sourceMetadata?.is_seadex_best === undefined
      ? {}
      : { is_seadex_best: sourceMetadata.is_seadex_best }),
    ...(sourceMetadata?.remake === undefined ? {} : { remake: sourceMetadata.remake }),
    ...(sourceMetadata?.trusted === undefined ? {} : { trusted: sourceMetadata.trusted }),
  });
}
