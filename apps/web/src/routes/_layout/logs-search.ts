import * as v from "valibot";
import {
  createDownloadEventsSearchDefaults,
  createDownloadEventsSearchSchema,
  LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
} from "~/lib/download-events-search";

const LOGS_FILTER_DEFAULTS = {
  endDate: "",
  eventType: "",
  level: "",
  startDate: "",
} as const;

const logsEventsDefaults = createDownloadEventsSearchDefaults(LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS);

const LogsSearchSchema = v.object({
  ...createDownloadEventsSearchSchema(LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS, logsEventsDefaults).entries,
  endDate: v.optional(v.string(), LOGS_FILTER_DEFAULTS.endDate),
  eventType: v.optional(v.string(), LOGS_FILTER_DEFAULTS.eventType),
  level: v.optional(v.string(), LOGS_FILTER_DEFAULTS.level),
  startDate: v.optional(v.string(), LOGS_FILTER_DEFAULTS.startDate),
});

export const logsSearchDefaults = {
  ...logsEventsDefaults,
  ...LOGS_FILTER_DEFAULTS,
} as const;

export type LogsSearchState = ReturnType<typeof parseLogsSearch>;

export function parseLogsSearch(search: Record<string, unknown>) {
  return {
    ...logsSearchDefaults,
    ...v.parse(LogsSearchSchema, search),
  };
}
