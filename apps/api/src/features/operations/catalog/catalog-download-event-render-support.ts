import { Stream } from "effect";

import type { DownloadEvent } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";
import type { DownloadEventExportHeader } from "@/features/operations/catalog/catalog-download-event-stream-support.ts";

export interface DownloadEventExportStreamShape {
  readonly header: DownloadEventExportHeader;
  readonly stream: Stream.Stream<Uint8Array, DatabaseError | OperationsStoredDataError>;
}

export interface DownloadEventCsvExportStreamShape {
  readonly header: DownloadEventExportHeader;
  readonly stream: Stream.Stream<Uint8Array, DatabaseError | OperationsStoredDataError>;
}

const textEncoder = new TextEncoder();

export function renderDownloadEventsExportJson(
  eventStream: Stream.Stream<DownloadEvent, DatabaseError | OperationsStoredDataError>,
  header: DownloadEventExportHeader,
): Stream.Stream<Uint8Array, DatabaseError | OperationsStoredDataError> {
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
  eventStream: Stream.Stream<DownloadEvent, DatabaseError | OperationsStoredDataError>,
): Stream.Stream<Uint8Array, DatabaseError | OperationsStoredDataError> {
  const csvHeader = textEncoder.encode(
    "id,created_at,event_type,from_status,to_status,anime_id,anime_title,download_id,torrent_name,message,metadata,metadata_json\n",
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
          event.anime_id === undefined ? "" : String(event.anime_id),
          escapeCsv(event.anime_title ?? ""),
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
