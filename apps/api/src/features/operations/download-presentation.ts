import { Effect } from "effect";

import type { Download, DownloadAllowedAction, DownloadStatus } from "@packages/shared/index.ts";
import type { downloads } from "@/db/schema.ts";
import { decodeOptionalNumberList } from "@/features/profiles/profile-codec.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { decodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";

type DownloadRow = typeof downloads.$inferSelect;

type NormalizedDownloadState =
  | "completed"
  | "downloading"
  | "error"
  | "failed"
  | "paused"
  | "queued"
  | "unknown";

export const toDownload = Effect.fn("OperationsPresentation.toDownload")(function* (
  row: DownloadRow,
  context?: DownloadPresentationContext,
) {
  const coveredEpisodes = yield* decodeCoveredEpisodes(row.coveredEpisodes);
  const coveragePending = row.isBatch && (!coveredEpisodes || coveredEpisodes.length === 0);
  const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
  const policy = resolveDownloadActionPolicy(row.status, row.reconciledAt);

  return {
    added_at: row.addedAt,
    anime_id: row.animeId,
    anime_image: context?.animeImage,
    anime_title: row.animeTitle,
    content_path: row.contentPath ?? undefined,
    coverage_pending: coveragePending || undefined,
    covered_episodes: coveredEpisodes,
    decision_reason: sourceMetadata?.decision_reason,
    download_date: row.downloadDate ?? undefined,
    downloaded_bytes: row.downloadedBytes ?? undefined,
    episode_number: row.episodeNumber,
    error_message: row.errorMessage ?? undefined,
    eta_seconds: row.etaSeconds ?? undefined,
    external_state: row.externalState ?? undefined,
    group_name: row.groupName ?? undefined,
    id: row.id,
    imported_path: context?.importedPath,
    is_batch: row.isBatch,
    last_error_at: row.lastErrorAt ?? undefined,
    last_synced_at: row.lastSyncedAt ?? undefined,
    progress: row.progress ?? undefined,
    reconciled_at: row.reconciledAt ?? undefined,
    retry_count: row.retryCount,
    save_path: row.savePath ?? undefined,
    speed_bytes: row.speedBytes ?? undefined,
    status: row.status,
    source_metadata: sourceMetadata,
    allowed_actions: policy.download,
    torrent_name: row.torrentName,
    total_bytes: row.totalBytes ?? undefined,
  } satisfies Download;
});

export const toDownloadStatus = Effect.fn("OperationsPresentation.toDownloadStatus")(function* (
  row: DownloadRow,
  context?: DownloadPresentationContext,
) {
  const progress = row.progress ?? 0;
  const totalBytes = row.totalBytes ?? 0;
  const downloadedBytes = row.downloadedBytes ?? 0;
  const coveredEpisodes = yield* decodeCoveredEpisodes(row.coveredEpisodes);
  const coveragePending = row.isBatch && (!coveredEpisodes || coveredEpisodes.length === 0);
  const infoHash =
    row.infoHash ??
    (yield* new OperationsStoredDataError({
      message: "Stored download info hash is missing",
    }));
  const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
  const policy = resolveDownloadActionPolicy(row.status, row.reconciledAt);

  return {
    anime_id: row.animeId,
    anime_image: context?.animeImage,
    anime_title: row.animeTitle,
    coverage_pending: coveragePending || undefined,
    covered_episodes: coveredEpisodes,
    decision_reason: sourceMetadata?.decision_reason,
    downloaded_bytes: downloadedBytes,
    eta: row.etaSeconds ?? 0,
    hash: infoHash,
    id: row.id,
    episode_number: row.episodeNumber,
    imported_path: context?.importedPath,
    is_batch: row.isBatch,
    name: row.torrentName,
    progress: Math.max(0, Math.min(progress / 100, 1)),
    speed: row.speedBytes ?? 0,
    source_metadata: sourceMetadata,
    state: row.status,
    total_bytes: totalBytes,
    allowed_actions: policy.runtime,
  } satisfies DownloadStatus;
});

function resolveDownloadActionPolicy(
  status: string | null | undefined,
  reconciledAt: string | null | undefined,
): {
  readonly download: DownloadAllowedAction[] | undefined;
  readonly runtime: DownloadAllowedAction[] | undefined;
} {
  const state = normalizeDownloadState(status);
  const download = new Set<DownloadAllowedAction>(["delete"]);
  const runtime = new Set<DownloadAllowedAction>();

  switch (state) {
    case "downloading": {
      download.add("pause");
      runtime.add("pause");
      break;
    }
    case "queued":
    case "paused": {
      download.add("resume");
      runtime.add("resume");
      break;
    }
    case "failed":
    case "error": {
      download.add("retry");
      runtime.add("retry");
      runtime.add("resume");
      break;
    }
    case "completed": {
      if (!reconciledAt) {
        download.add("reconcile");
      }
      break;
    }
    case "unknown": {
      break;
    }
  }

  return {
    download: toAllowedActionArray(download),
    runtime: toAllowedActionArray(runtime),
  };
}

function normalizeDownloadState(status: string | null | undefined): NormalizedDownloadState {
  const value = status?.toLowerCase();

  switch (value) {
    case "queued":
    case "downloading":
    case "paused":
    case "failed":
    case "error":
    case "completed":
      return value;
    default:
      return "unknown";
  }
}

function toAllowedActionArray(
  actions: ReadonlySet<DownloadAllowedAction>,
): DownloadAllowedAction[] | undefined {
  return actions.size > 0 ? [...actions] : undefined;
}

const decodeCoveredEpisodes = Effect.fn("OperationsPresentation.decodeCoveredEpisodes")(function* (
  value: string | null | undefined,
) {
  if (!value) {
    return undefined;
  }

  return yield* decodeOptionalNumberList(value).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsStoredDataError({
          cause,
          message: "Stored covered episode metadata is corrupt",
        }),
    ),
  );
});
