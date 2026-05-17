import {
  createDownloadEventsSearchDefaults,
  createDownloadEventsSearchSchema,
  DOWNLOADS_EVENTS_SEARCH_KEYS,
} from "~/domain/download/events-search";
import { Schema } from "effect";

export type DownloadsTab = "events" | "history" | "queue";

export interface DownloadsSearchState {
  [key: string]: string | undefined;
  [DOWNLOADS_EVENTS_SEARCH_KEYS.mediaId]?: string;
  [DOWNLOADS_EVENTS_SEARCH_KEYS.cursor]?: string;
  [DOWNLOADS_EVENTS_SEARCH_KEYS.direction]?: string;
  [DOWNLOADS_EVENTS_SEARCH_KEYS.downloadId]?: string;
  [DOWNLOADS_EVENTS_SEARCH_KEYS.endDate]?: string;
  [DOWNLOADS_EVENTS_SEARCH_KEYS.eventType]?: string;
  [DOWNLOADS_EVENTS_SEARCH_KEYS.startDate]?: string;
  [DOWNLOADS_EVENTS_SEARCH_KEYS.status]?: string;
  tab?: DownloadsTab;
}

export type DownloadsSearchPatch = Partial<{
  [K in keyof DownloadsSearchState]: DownloadsSearchState[K] | undefined;
}>;

const downloadsEventsSearchDefaults = createDownloadEventsSearchDefaults(
  DOWNLOADS_EVENTS_SEARCH_KEYS,
);

const DownloadsTabSchema = Schema.transform(
  Schema.String,
  Schema.Literal("events", "history", "queue"),
  {
    decode: (tab) => (tab === "events" || tab === "history" || tab === "queue" ? tab : "queue"),
    encode: (tab) => tab,
  },
);

export const downloadsSearchDefaults = {
  [DOWNLOADS_EVENTS_SEARCH_KEYS.mediaId]:
    downloadsEventsSearchDefaults[DOWNLOADS_EVENTS_SEARCH_KEYS.mediaId] ?? "",
  [DOWNLOADS_EVENTS_SEARCH_KEYS.cursor]:
    downloadsEventsSearchDefaults[DOWNLOADS_EVENTS_SEARCH_KEYS.cursor] ?? "",
  [DOWNLOADS_EVENTS_SEARCH_KEYS.direction]:
    downloadsEventsSearchDefaults[DOWNLOADS_EVENTS_SEARCH_KEYS.direction] ?? "next",
  [DOWNLOADS_EVENTS_SEARCH_KEYS.downloadId]:
    downloadsEventsSearchDefaults[DOWNLOADS_EVENTS_SEARCH_KEYS.downloadId] ?? "",
  [DOWNLOADS_EVENTS_SEARCH_KEYS.endDate]:
    downloadsEventsSearchDefaults[DOWNLOADS_EVENTS_SEARCH_KEYS.endDate] ?? "",
  [DOWNLOADS_EVENTS_SEARCH_KEYS.eventType]:
    downloadsEventsSearchDefaults[DOWNLOADS_EVENTS_SEARCH_KEYS.eventType] ?? "all",
  [DOWNLOADS_EVENTS_SEARCH_KEYS.startDate]:
    downloadsEventsSearchDefaults[DOWNLOADS_EVENTS_SEARCH_KEYS.startDate] ?? "",
  [DOWNLOADS_EVENTS_SEARCH_KEYS.status]:
    downloadsEventsSearchDefaults[DOWNLOADS_EVENTS_SEARCH_KEYS.status] ?? "",
  tab: "queue",
} as const;

const DownloadsSearchSchema = Schema.Struct({
  ...createDownloadEventsSearchSchema(DOWNLOADS_EVENTS_SEARCH_KEYS, downloadsEventsSearchDefaults)
    .fields,
  tab: Schema.optionalWith(DownloadsTabSchema, {
    default: () => downloadsSearchDefaults.tab,
  }),
});

const DOWNLOADS_SEARCH_FIELDS = [
  DOWNLOADS_EVENTS_SEARCH_KEYS.mediaId,
  DOWNLOADS_EVENTS_SEARCH_KEYS.cursor,
  DOWNLOADS_EVENTS_SEARCH_KEYS.direction,
  DOWNLOADS_EVENTS_SEARCH_KEYS.downloadId,
  DOWNLOADS_EVENTS_SEARCH_KEYS.endDate,
  DOWNLOADS_EVENTS_SEARCH_KEYS.eventType,
  DOWNLOADS_EVENTS_SEARCH_KEYS.startDate,
  DOWNLOADS_EVENTS_SEARCH_KEYS.status,
  "tab",
] as const;

type DownloadsSearchField = (typeof DOWNLOADS_SEARCH_FIELDS)[number];

const downloadsSearchDefaultsByField: Record<DownloadsSearchField, string> = {
  [DOWNLOADS_EVENTS_SEARCH_KEYS.mediaId]: downloadsSearchDefaults.events_media_id,
  [DOWNLOADS_EVENTS_SEARCH_KEYS.cursor]: downloadsSearchDefaults.events_cursor,
  [DOWNLOADS_EVENTS_SEARCH_KEYS.direction]: downloadsSearchDefaults.events_direction,
  [DOWNLOADS_EVENTS_SEARCH_KEYS.downloadId]: downloadsSearchDefaults.events_download_id,
  [DOWNLOADS_EVENTS_SEARCH_KEYS.endDate]: downloadsSearchDefaults.events_end_date,
  [DOWNLOADS_EVENTS_SEARCH_KEYS.eventType]: downloadsSearchDefaults.events_event_type,
  [DOWNLOADS_EVENTS_SEARCH_KEYS.startDate]: downloadsSearchDefaults.events_start_date,
  [DOWNLOADS_EVENTS_SEARCH_KEYS.status]: downloadsSearchDefaults.events_status,
  tab: downloadsSearchDefaults.tab,
};

export function toDownloadsTab(value: string | null | undefined): DownloadsTab {
  if (value === "events" || value === "history" || value === "queue") return value;
  return "queue";
}

export function parseDownloadsSearch(search: Record<string, unknown>): DownloadsSearchState {
  return Schema.decodeUnknownSync(DownloadsSearchSchema)(search);
}

export function normalizeDownloadsSearch(state: DownloadsSearchState): DownloadsSearchPatch {
  const normalized: DownloadsSearchPatch = {};

  for (const key of DOWNLOADS_SEARCH_FIELDS) {
    const value = state[key];

    if (key === "tab") {
      if (
        (value === "queue" || value === "events" || value === "history") &&
        value !== downloadsSearchDefaultsByField[key]
      ) {
        normalized[key] = value;
      }
      continue;
    }

    if (value !== undefined && value !== downloadsSearchDefaultsByField[key]) {
      normalized[key] = value;
    }
  }

  return normalized;
}
