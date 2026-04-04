import { Effect, Schema } from "effect";

import type { Download, DownloadSourceMetadata, DownloadStatus } from "@packages/shared/index.ts";
import {
  DownloadEventMetadataSchema,
  DownloadSourceMetadataSchema,
} from "@packages/shared/index.ts";
import { toSharedParsedEpisodeIdentity } from "@/lib/media-identity.ts";
import type { downloads } from "@/db/schema.ts";
import { effectDecodeOptionalNumberList } from "@/features/system/config-codec.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";

type DownloadRow = typeof downloads.$inferSelect;

const DownloadSourceMetadataJsonSchema = Schema.parseJson(DownloadSourceMetadataSchema);
const DownloadEventMetadataJsonSchema = Schema.parseJson(DownloadEventMetadataSchema);

export const toDownload = Effect.fn("OperationsRepository.toDownload")(function* (
  row: DownloadRow,
  context?: DownloadPresentationContext,
) {
  const coveredEpisodes = yield* decodeCoveredEpisodes(row.coveredEpisodes);
  const coveragePending =
    Boolean(row.isBatch) && (!coveredEpisodes || coveredEpisodes.length === 0);
  const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);

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
    torrent_name: row.torrentName,
    total_bytes: row.totalBytes ?? undefined,
  } satisfies Download;
});

export const toDownloadStatus = Effect.fn("OperationsRepository.toDownloadStatus")(function* (
  row: DownloadRow,
  context?: DownloadPresentationContext,
) {
  const progress = row.progress ?? 0;
  const totalBytes = row.totalBytes ?? 0;
  const downloadedBytes = row.downloadedBytes ?? 0;
  const coveredEpisodes = yield* decodeCoveredEpisodes(row.coveredEpisodes);
  const coveragePending =
    Boolean(row.isBatch) && (!coveredEpisodes || coveredEpisodes.length === 0);
  const infoHash =
    row.infoHash ??
    (yield* new OperationsStoredDataError({
      message: "Stored download info hash is missing",
    }));
  const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);

  return {
    anime_id: row.animeId,
    anime_image: context?.animeImage,
    anime_title: row.animeTitle,
    coverage_pending: coveragePending || undefined,
    covered_episodes: coveredEpisodes,
    decision_reason: sourceMetadata?.decision_reason,
    downloaded_bytes: downloadedBytes,
    eta: row.etaSeconds ?? (row.status === "queued" ? 8640000 : 0),
    hash: infoHash,
    id: row.id,
    episode_number: row.episodeNumber,
    imported_path: context?.importedPath,
    is_batch: row.isBatch,
    name: row.torrentName,
    progress: Math.max(0, Math.min(progress / 100, 1)),
    speed: row.speedBytes ?? (row.status === "downloading" ? 1024 * 1024 : 0),
    source_metadata: sourceMetadata,
    state: row.status,
    total_bytes: totalBytes,
  } satisfies DownloadStatus;
});

export function encodeDownloadSourceMetadata(
  value: DownloadSourceMetadata,
): Effect.Effect<string, OperationsStoredDataError> {
  return Schema.encode(DownloadSourceMetadataJsonSchema)({
    ...value,
    seadex_tags: value.seadex_tags ? [...value.seadex_tags] : undefined,
  }).pipe(
    Effect.mapError(
      () =>
        new OperationsStoredDataError({
          message: "Download source metadata is invalid",
        }),
    ),
  );
}

export const decodeDownloadSourceMetadata = Effect.fn(
  "OperationsRepository.decodeDownloadSourceMetadata",
)(function* (value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(DownloadSourceMetadataJsonSchema)(value).pipe(
    Effect.map((decoded) => cloneDownloadSourceMetadata(decoded)),
    Effect.mapError(
      () =>
        new OperationsStoredDataError({
          message: "Stored download source metadata is corrupt",
        }),
    ),
  );
});

function cloneDownloadSourceMetadata(value: DownloadSourceMetadata): DownloadSourceMetadata {
  return {
    ...value,
    ...(value.seadex_tags ? { seadex_tags: [...value.seadex_tags] } : {}),
    source_identity: toSharedParsedEpisodeIdentity(value.source_identity),
  };
}

export function encodeDownloadEventMetadata(value: {
  covered_episodes?: readonly number[];
  imported_path?: string;
  source_metadata?: DownloadSourceMetadata;
}): Effect.Effect<string, OperationsStoredDataError> {
  return Schema.encode(DownloadEventMetadataJsonSchema)({
    covered_episodes: value.covered_episodes ? [...value.covered_episodes] : undefined,
    imported_path: value.imported_path,
    source_metadata: value.source_metadata,
  }).pipe(
    Effect.mapError(
      () =>
        new OperationsStoredDataError({
          message: "Download event metadata is invalid",
        }),
    ),
  );
}

const decodeCoveredEpisodes = Effect.fn("OperationsRepository.decodeCoveredEpisodes")(function* (
  value: string | null | undefined,
) {
  if (!value) {
    return undefined;
  }

  return yield* effectDecodeOptionalNumberList(value).pipe(
    Effect.mapError(
      () =>
        new OperationsStoredDataError({
          message: "Stored covered episode metadata is corrupt",
        }),
    ),
  );
});
