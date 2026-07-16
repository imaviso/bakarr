import { Effect } from "effect";

import type { DownloadSourceMetadata } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { InfrastructureError, StoredDataError } from "@/features/errors.ts";
import {
  hasOverlappingDownload,
  parseCoveredUnitsEffect,
} from "@/features/operations/download/download-coverage.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { encodeDownloadSourceMetadata } from "@/features/operations/repository/download-row-codec.ts";
import type { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";

const mapQBitError = (message: string) => (cause: unknown) =>
  cause instanceof DatabaseError
    ? cause
    : new InfrastructureError({
        message,
        cause,
      });

export const queueParsedReleaseDownload = Effect.fn("ReleaseQueue.queueParsedReleaseDownload")(
  function* (input: {
    animeRow: typeof media.$inferSelect;
    contextMessage: string;
    coveredUnits: string | null;
    downloadRepository: typeof DownloadRepository.Service;
    unitNumber: number;
    eventMessage: string;
    eventType: string;
    isBatch: boolean;
    item: ParsedRelease;
    sourceMetadata: DownloadSourceMetadata;
    torrentClientService: typeof TorrentClientService.Service;
    nowIso: () => Effect.Effect<string>;
  }) {
    const coveredEpisodeNumbers = yield* parseCoveredUnitsEffect(input.coveredUnits);
    const now = yield* input.nowIso();

    const overlapping = yield* hasOverlappingDownload(
      input.downloadRepository,
      input.animeRow.id,
      input.item.infoHash,
      coveredEpisodeNumbers,
    );

    if (overlapping) {
      return { _tag: "skipped" } as const;
    }

    const encodedSourceMetadata = yield* encodeDownloadSourceMetadata(input.sourceMetadata);

    const insertResult = yield* Effect.either(
      input.downloadRepository.insertQueuedDownloadRow({
        addedAt: now,
        coveredUnits: input.coveredUnits,
        groupName: input.item.group ?? null,
        infoHash: input.item.infoHash,
        isBatch: input.isBatch,
        lastSyncedAt: now,
        magnet: input.item.magnet,
        mediaId: input.animeRow.id,
        mediaTitle: input.animeRow.titleRomaji,
        sourceMetadata: encodedSourceMetadata,
        torrentName: input.item.title,
        totalBytes: input.item.sizeBytes,
        unitNumber: input.unitNumber,
      }),
    );

    if (insertResult._tag === "Left") {
      const dbError = insertResult.left;

      if (dbError instanceof DatabaseError && dbError.isUniqueConstraint()) {
        return { _tag: "skipped" } as const;
      }

      return yield* dbError;
    }

    const insertedId = insertResult.right;
    let status = "queued";

    const qbitResult = yield* Effect.either(
      input.torrentClientService.addTorrentUrlIfEnabled(input.item.magnet),
    );

    if (qbitResult._tag === "Left") {
      yield* input.downloadRepository.deleteDownloadRow(insertedId);
      return yield* mapQBitError(input.contextMessage)(qbitResult.left);
    }

    if (qbitResult.right._tag === "Added") {
      status = "downloading";
      yield* input.downloadRepository.updateDownloadStatusRow({
        id: insertedId,
        externalState: status,
        status,
      });
    }

    yield* input.downloadRepository.insertDownloadEvent(
      {
        mediaId: input.animeRow.id,
        downloadId: insertedId,
        eventType: input.eventType,
        message: input.eventMessage,
        metadata: input.coveredUnits,
        metadataJson: {
          covered_units: coveredEpisodeNumbers,
          source_metadata: input.sourceMetadata,
        },
        toStatus: status,
      },
      now,
    );

    return {
      _tag: "queued",
      id: insertedId,
      status,
    } as const;
  },
);

export type QueueParsedReleaseDownloadError = DatabaseError | InfrastructureError | StoredDataError;
