import { Schema } from "effect";
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

const baseEventsSchema = createDownloadEventsSearchSchema(LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS, logsEventsDefaults);

const LogsSearchSchema = Schema.Struct({
  ...baseEventsSchema.fields,
  endDate: Schema.optionalWith(Schema.String, { default: () => LOGS_FILTER_DEFAULTS.endDate }),
  eventType: Schema.optionalWith(Schema.String, { default: () => LOGS_FILTER_DEFAULTS.eventType }),
  level: Schema.optionalWith(Schema.String, { default: () => LOGS_FILTER_DEFAULTS.level }),
  startDate: Schema.optionalWith(Schema.String, { default: () => LOGS_FILTER_DEFAULTS.startDate }),
});

export const logsSearchDefaults = {
  ...logsEventsDefaults,
  ...LOGS_FILTER_DEFAULTS,
} as const;

export type LogsSearchState = ReturnType<typeof parseLogsSearch>;

export function parseLogsSearch(search: Record<string, unknown>) {
  return {
    ...logsSearchDefaults,
    ...Schema.decodeUnknownSync(LogsSearchSchema)(search),
  };
}
