import * as v from "valibot";

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

export const DOWNLOADS_EVENTS_SEARCH_KEYS: DownloadEventsSearchKeys = {
  animeId: "events_anime_id",
  cursor: "events_cursor",
  direction: "events_direction",
  downloadId: "events_download_id",
  endDate: "events_end_date",
  eventType: "events_event_type",
  startDate: "events_start_date",
  status: "events_status",
};

export const LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS: DownloadEventsSearchKeys = {
  animeId: "download_anime_id",
  cursor: "download_cursor",
  direction: "download_direction",
  downloadId: "download_download_id",
  endDate: "download_end_date",
  eventType: "download_event_type",
  startDate: "download_start_date",
  status: "download_status",
};

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
  return v.object({
    [keys.animeId]: v.optional(v.string(), defaults[keys.animeId]),
    [keys.cursor]: v.optional(v.string(), defaults[keys.cursor]),
    [keys.direction]: v.optional(v.picklist(["next", "prev"]), "next"),
    [keys.downloadId]: v.optional(v.string(), defaults[keys.downloadId]),
    [keys.endDate]: v.optional(v.string(), defaults[keys.endDate]),
    [keys.eventType]: v.optional(v.string(), defaults[keys.eventType]),
    [keys.startDate]: v.optional(v.string(), defaults[keys.startDate]),
    [keys.status]: v.optional(v.string(), defaults[keys.status]),
  });
}

export function parseDownloadEventsSearch(
  search: Record<string, unknown>,
  keys: DownloadEventsSearchKeys,
): Record<string, string> {
  const defaults = createDownloadEventsSearchDefaults(keys);
  const parsed = v.parse(createDownloadEventsSearchSchema(keys, defaults), search);
  const read = (key: string) => {
    const value = parsed[key];
    if (typeof value === "string") {
      return value;
    }

    return defaults[key] ?? "";
  };

  return {
    ...defaults,
    [keys.animeId]: read(keys.animeId),
    [keys.cursor]: read(keys.cursor),
    [keys.direction]: read(keys.direction),
    [keys.downloadId]: read(keys.downloadId),
    [keys.endDate]: read(keys.endDate),
    [keys.eventType]: read(keys.eventType),
    [keys.startDate]: read(keys.startDate),
    [keys.status]: read(keys.status),
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
