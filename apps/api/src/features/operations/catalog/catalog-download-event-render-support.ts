import { Stream } from "effect";

import type { DownloadEvent } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { StoredDataError } from "@/features/errors.ts";
import type { DownloadEventExportHeader } from "@/features/operations/repository/download-repository-service.ts";

export interface DownloadEventExportStreamShape {
  readonly header: DownloadEventExportHeader;
  readonly stream: Stream.Stream<Uint8Array, DatabaseError | StoredDataError>;
}

export interface DownloadEventCsvExportStreamShape {
  readonly header: DownloadEventExportHeader;
  readonly stream: Stream.Stream<Uint8Array, DatabaseError | StoredDataError>;
}

const textEncoder = new TextEncoder();

export function renderDownloadEventsExportJson(
  eventStream: Stream.Stream<DownloadEvent, DatabaseError | StoredDataError>,
  header: DownloadEventExportHeader,
): Stream.Stream<Uint8Array, DatabaseError | StoredDataError> {
  const suffixMetadata = JSON.stringify(header);
  const objectPrefix = textEncoder.encode('{"events":[');
  const objectSuffix = textEncoder.encode(`],${suffixMetadata.slice(1)}`);

  const encodedEvents = eventStream.pipe(
    Stream.zipWithIndex,
    Stream.map(([event, index]) =>
      textEncoder.encode(`${index === 0 ? "" : ","}${JSON.stringify(event)}`),
    ),
  );

  return Stream.concat(
    Stream.fromIterable([objectPrefix]),
    Stream.concat(encodedEvents, Stream.fromIterable([objectSuffix])),
  );
}

export function renderDownloadEventsExportCsv(
  eventStream: Stream.Stream<DownloadEvent, DatabaseError | StoredDataError>,
): Stream.Stream<Uint8Array, DatabaseError | StoredDataError> {
  const csvHeader = textEncoder.encode(
    "id,created_at,event_type,from_status,to_status,media_id,media_title,download_id,torrent_name,message,metadata,metadata_json\n",
  );

  const rows = eventStream.pipe(
    Stream.map((event) =>
      textEncoder.encode(
        [
          String(event.id),
          event.created_at,
          escapeCsv(event.event_type),
          escapeCsv(event.from_status ?? ""),
          escapeCsv(event.to_status ?? ""),
          event.media_id === undefined ? "" : String(event.media_id),
          escapeCsv(event.media_title ?? ""),
          event.download_id === undefined ? "" : String(event.download_id),
          escapeCsv(event.torrent_name ?? ""),
          escapeCsv(event.message),
          escapeCsv(event.metadata ?? ""),
          escapeCsv(event.metadata_json ? JSON.stringify(event.metadata_json) : ""),
        ].join(",") + "\n",
      ),
    ),
  );

  return Stream.concat(Stream.fromIterable([csvHeader]), rows);
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
