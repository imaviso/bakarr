import { Effect, Schema, SchemaTransformation } from "effect";

export type DownloadEventsDirection = "next" | "prev";

export interface DownloadEventsSearchKeys {
  mediaId: string;
  cursor: string;
  direction: string;
  downloadId: string;
  endDate: string;
  eventType: string;
  startDate: string;
  status: string;
}

export const DOWNLOADS_EVENTS_SEARCH_KEYS = {
  mediaId: "events_media_id",
  cursor: "events_cursor",
  direction: "events_direction",
  downloadId: "events_download_id",
  endDate: "events_end_date",
  eventType: "events_event_type",
  startDate: "events_start_date",
  status: "events_status",
} as const satisfies DownloadEventsSearchKeys;

export const LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS = {
  mediaId: "download_media_id",
  cursor: "download_cursor",
  direction: "download_direction",
  downloadId: "download_download_id",
  endDate: "download_end_date",
  eventType: "download_event_type",
  startDate: "download_start_date",
  status: "download_status",
} as const satisfies DownloadEventsSearchKeys;

export function createDownloadsRouteSearch(input?: {
  mediaId?: string | undefined;
  tab?: "events" | "history" | "queue" | undefined;
}) {
  const mediaId = input?.mediaId?.trim();

  return {
    ...createDownloadEventsSearchDefaults(DOWNLOADS_EVENTS_SEARCH_KEYS),
    ...(mediaId ? { [DOWNLOADS_EVENTS_SEARCH_KEYS.mediaId]: mediaId } : {}),
    tab: input?.tab ?? "queue",
  };
}

export function createLogsRouteSearch(input?: { mediaId?: string | undefined }) {
  const defaults = createDownloadEventsSearchDefaults(LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS);
  const mediaId = input?.mediaId?.trim();

  return {
    ...defaults,
    endDate: "",
    eventType: "",
    level: "",
    startDate: "",
    ...(mediaId ? { [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.mediaId]: mediaId } : {}),
  };
}

export function toDownloadEventsDirection(direction: string | undefined): DownloadEventsDirection {
  return direction === "prev" ? "prev" : "next";
}

export function createDownloadEventsSearchDefaults(
  keys: DownloadEventsSearchKeys,
): Record<string, string> {
  return {
    [keys.mediaId]: "",
    [keys.cursor]: "",
    [keys.direction]: "next",
    [keys.downloadId]: "",
    [keys.endDate]: "",
    [keys.eventType]: "all",
    [keys.startDate]: "",
    [keys.status]: "",
  };
}

export function createDownloadEventsSearchSchema(
  keys: DownloadEventsSearchKeys,
  defaults = createDownloadEventsSearchDefaults(keys),
) {
  const DirectionSchema = Schema.String.pipe(
    Schema.decodeTo(
      Schema.Literals(["next", "prev"]),
      SchemaTransformation.transform({
        decode: (direction) => toDownloadEventsDirection(direction),
        encode: (direction) => direction,
      }),
    ),
  );

  return Schema.Struct({
    [keys.mediaId]: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed(defaults[keys.mediaId] ?? "")),
    ),
    [keys.cursor]: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed(defaults[keys.cursor] ?? "")),
    ),
    [keys.direction]: DirectionSchema.pipe(Schema.withDecodingDefaultType(Effect.succeed("next"))),
    [keys.downloadId]: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed(defaults[keys.downloadId] ?? "")),
    ),
    [keys.endDate]: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed(defaults[keys.endDate] ?? "")),
    ),
    [keys.eventType]: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed(defaults[keys.eventType] ?? "")),
    ),
    [keys.startDate]: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed(defaults[keys.startDate] ?? "")),
    ),
    [keys.status]: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed(defaults[keys.status] ?? "")),
    ),
  });
}

export function parseDownloadEventsSearch(
  search: Record<string, unknown>,
  keys: DownloadEventsSearchKeys,
): Record<string, string> {
  const defaults = createDownloadEventsSearchDefaults(keys);
  const parsed = Schema.decodeUnknownSync(createDownloadEventsSearchSchema(keys, defaults))(search);

  return {
    ...defaults,
    ...parsed,
  };
}

export function createDownloadEventsCursorPatch(
  keys: DownloadEventsSearchKeys,
  direction: DownloadEventsDirection,
  cursor: string,
) {
  return {
    [keys.cursor]: cursor,
    [keys.direction]: direction,
  };
}
