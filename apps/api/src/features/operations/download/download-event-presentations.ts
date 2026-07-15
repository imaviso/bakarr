import { Effect, Schema } from "effect";

import {
  brandMediaId,
  brandDownloadEventId,
  brandDownloadId,
  DownloadEventMetadataSchema,
  type DownloadEvent,
} from "@packages/shared/index.ts";
import { StoredDataError } from "@/features/errors.ts";

const DownloadEventMetadataJsonSchema = Schema.parseJson(DownloadEventMetadataSchema);

export interface DownloadEventPresentationContext {
  readonly mediaImage?: string | undefined;
  readonly mediaTitle?: string | undefined;
  readonly torrentName?: string | undefined;
}

export interface DownloadEventRowLike {
  readonly mediaId: number | null;
  readonly createdAt: string;
  readonly downloadId: number | null;
  readonly eventType: string;
  readonly fromStatus: string | null;
  readonly id: number;
  readonly message: string;
  readonly metadata: string | null;
  readonly toStatus: string | null;
}

export const decodeDownloadEventMetadata = Effect.fn(
  "DownloadEventPresentations.decodeDownloadEventMetadata",
)(function* (value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(DownloadEventMetadataJsonSchema)(value).pipe(
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "Stored download event metadata is corrupt",
        }),
    ),
  );
});

export const toDownloadEvent = Effect.fn("DownloadEventPresentations.toDownloadEvent")(function* (
  row: DownloadEventRowLike,
  context?: DownloadEventPresentationContext,
) {
  return {
    media_id: row.mediaId === null ? undefined : brandMediaId(row.mediaId),
    media_image: context?.mediaImage,
    media_title: context?.mediaTitle,
    created_at: row.createdAt,
    download_id: row.downloadId === null ? undefined : brandDownloadId(row.downloadId),
    event_type: row.eventType,
    from_status: row.fromStatus ?? undefined,
    id: brandDownloadEventId(row.id),
    message: row.message,
    metadata: row.metadata ?? undefined,
    metadata_json: yield* decodeDownloadEventMetadata(row.metadata),
    torrent_name: context?.torrentName,
    to_status: row.toStatus ?? undefined,
  } satisfies DownloadEvent;
});
