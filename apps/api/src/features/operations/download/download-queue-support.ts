import { Effect } from "effect";

import type { DownloadSourceMetadata } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { InfrastructureError } from "@/features/errors.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { encodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import {
  hasOverlappingDownload,
  inferCoveredUnitNumbers,
  parseCoveredUnitsEffect,
} from "@/features/operations/download/download-coverage.ts";
import { OperationsConflictError } from "@/features/operations/errors.ts";
import { resolveRequestedEpisodeNumber } from "@/features/operations/download/download-orchestration-shared.ts";
import { parseReleaseName } from "@/features/operations/search/release-ranking.ts";
import { parseVolumeNumbersFromTitle } from "@/features/operations/search/release-volume.ts";

/**
 * Single queue-download module. Manual-trigger (HTTP) and background-search
 * paths are callers that pass different conflict policies:
 * - `"fail-with-conflict"`: overlap/duplicate becomes an `OperationsConflictError`
 *   (HTTP-facing behavior preserved).
 * - `"skip"`: overlap/duplicate returns `{ _tag: "skipped" }` (background
 *   behavior preserved).
 *
 * Coverage resolution, the overlap check, row insert, magnet add, status
 * update, cleanup-on-failure, and the queue event all live here once.
 */

export interface DownloadCoveragePlan {
  readonly effectiveIsBatch: boolean;
  readonly inferredCoveredEpisodes: readonly number[];
  readonly inferredUnits: readonly number[];
  readonly requestedEpisode: number | undefined;
}

export function resolveDownloadCoveragePlan(input: {
  readonly explicitIsBatch?: boolean;
  readonly explicitUnitNumber?: number;
  readonly mediaKind: (typeof media.$inferSelect)["mediaKind"];
  readonly missingUnits: readonly number[];
  readonly title: string;
  readonly totalUnits?: number | null;
}): DownloadCoveragePlan {
  const parsedRelease = parseReleaseName(input.title);
  const parsedVolumes = parseVolumeNumbersFromTitle(input.title);
  const inferredUnits = input.mediaKind === "anime" ? parsedRelease.unitNumbers : parsedVolumes;
  const effectiveIsBatch =
    input.explicitIsBatch ??
    (input.mediaKind === "anime" ? parsedRelease.isBatch : parsedVolumes.length > 1);
  const requestedEpisode = resolveRequestedEpisodeNumber({
    ...(input.explicitUnitNumber === undefined
      ? {}
      : { explicitEpisode: input.explicitUnitNumber }),
    inferredEpisodes: inferredUnits,
    isBatch: effectiveIsBatch,
  });

  if (!requestedEpisode) {
    return {
      effectiveIsBatch,
      inferredCoveredEpisodes: [],
      inferredUnits,
      requestedEpisode,
    };
  }

  const shouldDeferBatchCoverage = effectiveIsBatch && inferredUnits.length === 0;
  const inferredCoveredEpisodes = shouldDeferBatchCoverage
    ? []
    : inferCoveredUnitNumbers({
        explicitEpisodes: inferredUnits,
        isBatch: effectiveIsBatch,
        ...(input.totalUnits === undefined ? {} : { totalUnits: input.totalUnits }),
        missingUnits: input.missingUnits,
        requestedEpisode,
      });

  return {
    effectiveIsBatch,
    inferredCoveredEpisodes,
    inferredUnits,
    requestedEpisode,
  };
}

export type QueueDownloadOutcome =
  | { readonly _tag: "queued"; readonly id: number; readonly status: "queued" | "downloading" }
  | { readonly _tag: "skipped" };

export const queueDownload = Effect.fn("Operations.queueDownload")(function* (input: {
  readonly downloadRepository: typeof DownloadRepository.Service;
  readonly torrentClientService: typeof TorrentClientService.Service;
  readonly nowIso: () => Effect.Effect<string>;
  readonly animeRow: typeof media.$inferSelect;
  readonly title: string;
  readonly magnet: string;
  readonly infoHash: string | null;
  readonly unitNumber: number;
  readonly isBatch: boolean;
  readonly coveredUnitsJson: string | null;
  readonly sourceMetadata: DownloadSourceMetadata;
  readonly group?: string;
  readonly totalBytes?: number | null;
  readonly event: { readonly type: string; readonly message: string };
  readonly conflictPolicy: "fail-with-conflict" | "skip";
}) {
  const coveredEpisodeNumbers = yield* parseCoveredUnitsEffect(input.coveredUnitsJson);

  if (input.infoHash) {
    const overlapping = yield* hasOverlappingDownload(
      input.downloadRepository,
      input.animeRow.id,
      input.infoHash,
      coveredEpisodeNumbers,
    );

    if (overlapping) {
      if (input.conflictPolicy === "fail-with-conflict") {
        return yield* new OperationsConflictError({
          message: "An in-flight download already covers these mediaUnits",
        });
      }
      return { _tag: "skipped" } satisfies QueueDownloadOutcome;
    }
  }

  const encodedSourceMetadata = yield* encodeDownloadSourceMetadata(input.sourceMetadata);
  const now = yield* input.nowIso();

  const insertResult = yield* Effect.either(
    input.downloadRepository.insertQueuedDownloadRow({
      addedAt: now,
      coveredUnits: input.coveredUnitsJson,
      groupName: input.group ?? null,
      infoHash: input.infoHash,
      isBatch: input.isBatch,
      lastSyncedAt: now,
      magnet: input.magnet,
      mediaId: input.animeRow.id,
      mediaTitle: input.animeRow.titleRomaji,
      sourceMetadata: encodedSourceMetadata,
      torrentName: input.title,
      ...(input.totalBytes === undefined || input.totalBytes === null
        ? {}
        : { totalBytes: input.totalBytes }),
      unitNumber: input.unitNumber,
    }),
  );

  if (insertResult._tag === "Left") {
    const insertError = insertResult.left;

    if (insertError instanceof DatabaseError && insertError.isUniqueConstraint()) {
      if (input.conflictPolicy === "fail-with-conflict") {
        return yield* new OperationsConflictError({ message: "Download already exists" });
      }
      return { _tag: "skipped" } satisfies QueueDownloadOutcome;
    }

    return yield* insertError;
  }

  const insertedId = insertResult.right;
  let status: "queued" | "downloading" = "queued";

  const qbitResult = yield* Effect.either(
    input.torrentClientService.addTorrentUrlIfEnabled(input.magnet),
  );

  if (qbitResult._tag === "Left") {
    const cleanupResult = yield* Effect.either(
      input.downloadRepository.deleteDownloadRow(insertedId),
    );

    if (cleanupResult._tag === "Left") {
      yield* Effect.logWarning(
        "Failed to clean up queued download after qBittorrent add failure",
      ).pipe(
        Effect.annotateLogs({
          cleanupError: cleanupResult.left.message,
          downloadId: insertedId,
        }),
      );
    }

    return yield* new InfrastructureError({
      message: "Failed to trigger download",
      cause: qbitResult.left,
    });
  }

  if (qbitResult.right._tag === "Added") {
    status = "downloading";
  }

  yield* input.downloadRepository.finalizeQueuedDownloadTx({
    downloadId: insertedId,
    eventType: input.event.type,
    eventMessage: input.event.message,
    eventMetadata: input.coveredUnitsJson,
    eventMetadataJson: {
      covered_units: coveredEpisodeNumbers,
      source_metadata: input.sourceMetadata,
    },
    externalState: status,
    mediaId: input.animeRow.id,
    now,
    status,
  });

  return { _tag: "queued", id: insertedId, status } satisfies QueueDownloadOutcome;
});
