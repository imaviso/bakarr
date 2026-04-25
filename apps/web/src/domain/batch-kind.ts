import type { ParsedEpisodeIdentity } from "@bakarr/shared";

export type BatchKind = "batch" | "season pack";

export function toBatchKindLabel(kind: BatchKind) {
  return kind === "batch" ? "Batch" : "Season Pack";
}

export function inferBatchKind(input: {
  isBatch?: boolean | undefined;
  coveredEpisodes?: readonly number[] | undefined;
  sourceIdentity?: ParsedEpisodeIdentity | undefined;
}): BatchKind | undefined {
  const coveredEpisodeCount = input.coveredEpisodes?.length ?? 0;
  const sourceIdentityEpisodeCount =
    input.sourceIdentity?.scheme === "daily"
      ? 0
      : (input.sourceIdentity?.episode_numbers?.length ?? 0);
  const hasSeasonIdentity = input.sourceIdentity?.scheme === "season";
  const inferredBatch =
    input.isBatch || coveredEpisodeCount > 1 || sourceIdentityEpisodeCount > 1 || hasSeasonIdentity;

  if (!inferredBatch) {
    return undefined;
  }

  return coveredEpisodeCount > 1 || sourceIdentityEpisodeCount > 1 ? "batch" : "season pack";
}

export function formatManualReleaseSearchDecisionReason(input: {
  batchKind?: BatchKind | undefined;
  trusted?: boolean | undefined;
}) {
  const batchSegment = input.batchKind ? ` ${input.batchKind}` : "";
  const trustedSegment = input.trusted ? " trusted" : "";
  return `Manual${batchSegment} grab from${trustedSegment} release search`;
}

export function formatReleaseSearchDecisionReason(input: {
  batchKind?: BatchKind | undefined;
  isSeaDex?: boolean | undefined;
  isSeaDexBest?: boolean | undefined;
  trusted?: boolean | undefined;
}) {
  if (input.isSeaDexBest) {
    return input.batchKind
      ? `${toBatchKindLabel(input.batchKind)} SeaDex Best release`
      : "SeaDex Best release";
  }

  if (input.isSeaDex) {
    return input.batchKind
      ? `${toBatchKindLabel(input.batchKind)} SeaDex recommended release`
      : "SeaDex recommended release";
  }

  return formatManualReleaseSearchDecisionReason({
    batchKind: input.batchKind,
    trusted: input.trusted,
  });
}
