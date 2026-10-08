import type { DownloadSourceMetadata } from "@packages/shared/index.ts";
import { Effect } from "effect";

import { parseCoveredUnitsEffect } from "@/features/operations/download/download-coverage.ts";
import { encodeDownloadEventMetadata } from "@/features/operations/repository/download-repository.ts";

/**
 * Single import-event envelope builder (Q5). Every import-side event —
 * reconcile batch/single finalize, sync status-change, sync coverage-refine —
 * carries the same shape: stored covered units + source metadata + imported
 * path. Parse + encode live here once instead of copy-pasted at each site.
 */
export const buildDownloadImportEventMetadata = Effect.fn(
  "DownloadImport.buildDownloadImportEventMetadata",
)(function* (input: {
  readonly coveredUnitsJson: string | null | undefined;
  readonly importedPath?: string;
  readonly sourceMetadata?: DownloadSourceMetadata;
}) {
  const coveredUnits = yield* parseCoveredUnitsEffect(input.coveredUnitsJson);
  return yield* encodeDownloadEventMetadata({
    covered_units: coveredUnits,
    ...(input.importedPath ? { imported_path: input.importedPath } : {}),
    ...(input.sourceMetadata ? { source_metadata: input.sourceMetadata } : {}),
  });
});

export const STALE_RECONCILE_CLAIM_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * A reconcile claim older than the threshold (or with a missing/unparseable
 * timestamp) is stale: its fiber is gone and the row must be released for
 * retry. Claims held by this process are never stale — the live-claim set in
 * the reconciliation module distinguishes "orphaned" from "still importing",
 * since slow storage can exceed any fixed threshold.
 */
export function isStaleReconcileClaim(
  claimedAt: string | null | undefined,
  nowIso: string,
  thresholdMs = STALE_RECONCILE_CLAIM_THRESHOLD_MS,
): boolean {
  if (!claimedAt) {
    return true;
  }
  const claimedMs = Date.parse(claimedAt);
  const nowMs = Date.parse(nowIso);
  if (globalThis.Number.isNaN(claimedMs) || globalThis.Number.isNaN(nowMs)) {
    return true;
  }
  return nowMs - claimedMs >= thresholdMs;
}
