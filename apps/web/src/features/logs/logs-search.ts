import { Effect, Schema } from "effect";
import {
  createDownloadEventsSearchDefaults,
  createDownloadEventsSearchSchema,
  LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
} from "@/domain/download/events-search";

const LOGS_FILTER_DEFAULTS = {
  endDate: "",
  eventType: "",
  level: "",
  startDate: "",
} as const;

const logsEventsDefaults = createDownloadEventsSearchDefaults(LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS);

const baseEventsSchema = createDownloadEventsSearchSchema(
  LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
  logsEventsDefaults,
);

const withDefault = (value: string) =>
  Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(value)));

const LogsSearchSchema = Schema.Struct({
  ...baseEventsSchema.fields,
  endDate: withDefault(LOGS_FILTER_DEFAULTS.endDate),
  eventType: withDefault(LOGS_FILTER_DEFAULTS.eventType),
  level: withDefault(LOGS_FILTER_DEFAULTS.level),
  startDate: withDefault(LOGS_FILTER_DEFAULTS.startDate),
});

export const logsSearchDefaults = {
  ...logsEventsDefaults,
  ...LOGS_FILTER_DEFAULTS,
} as const;

export interface LogsSearchState extends Record<string, string> {
  endDate: string;
  eventType: string;
  level: string;
  startDate: string;
}

export function parseLogsSearch(search: Record<string, unknown>): LogsSearchState {
  return Schema.decodeUnknownSync(LogsSearchSchema)(search);
}
