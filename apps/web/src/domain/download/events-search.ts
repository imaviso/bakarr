import { Schema } from "effect";

export type DownloadEventsDirection = "next" | "prev";

export interface DownloadEventsSearchKeys {
  animeId: string;
  cursor: string;
  direction: string;
  downloadId: string;
  endDate: string;
  eventType: string;
  startDate: string;
  status: string;
}

export const DOWNLOADS_EVENTS_SEARCH_KEYS = {
  animeId: "events_anime_id",
  cursor: "events_cursor",
  direction: "events_direction",
  downloadId: "events_download_id",
  endDate: "events_end_date",
  eventType: "events_event_type",
  startDate: "events_start_date",
  status: "events_status",
} as const satisfies DownloadEventsSearchKeys;

export const LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS = {
  animeId: "download_anime_id",
  cursor: "download_cursor",
  direction: "download_direction",
  downloadId: "download_download_id",
  endDate: "download_end_date",
  eventType: "download_event_type",
  startDate: "download_start_date",
  status: "download_status",
} as const satisfies DownloadEventsSearchKeys;

export function createDownloadsRouteSearch(input?: {
  animeId?: string | undefined;
  tab?: "events" | "history" | "queue" | undefined;
}) {
  return {
    ...createDownloadEventsSearchDefaults(DOWNLOADS_EVENTS_SEARCH_KEYS),
    ...(input?.animeId ? { [DOWNLOADS_EVENTS_SEARCH_KEYS.animeId]: input.animeId } : {}),
    tab: input?.tab ?? "queue",
  };
}

export function createLogsRouteSearch(input?: { animeId?: string | undefined }) {
  const defaults = createDownloadEventsSearchDefaults(LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS);

  return {
    ...defaults,
    endDate: "",
    eventType: "",
    level: "",
    startDate: "",
    ...(input?.animeId ? { [LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS.animeId]: input.animeId } : {}),
  };
}

export function toDownloadEventsDirection(direction: string | undefined): DownloadEventsDirection {
  return direction === "prev" ? "prev" : "next";
}

export function createDownloadEventsSearchDefaults(
  keys: DownloadEventsSearchKeys,
): Record<string, string> {
  return {
    [keys.animeId]: "",
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
  return Schema.Struct({
    [keys.animeId]: Schema.optionalWith(Schema.String, {
      default: () => defaults[keys.animeId] ?? "",
    }),
    [keys.cursor]: Schema.optionalWith(Schema.String, {
      default: () => defaults[keys.cursor] ?? "",
    }),
    [keys.direction]: Schema.optionalWith(Schema.Literal("next", "prev"), {
      default: () => "next",
    }),
    [keys.downloadId]: Schema.optionalWith(Schema.String, {
      default: () => defaults[keys.downloadId] ?? "",
    }),
    [keys.endDate]: Schema.optionalWith(Schema.String, {
      default: () => defaults[keys.endDate] ?? "",
    }),
    [keys.eventType]: Schema.optionalWith(Schema.String, {
      default: () => defaults[keys.eventType] ?? "",
    }),
    [keys.startDate]: Schema.optionalWith(Schema.String, {
      default: () => defaults[keys.startDate] ?? "",
    }),
    [keys.status]: Schema.optionalWith(Schema.String, {
      default: () => defaults[keys.status] ?? "",
    }),
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
  } as Record<string, string>;
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
