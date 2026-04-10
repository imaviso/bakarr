import {
  buildDownloadEventsFilterInput as buildDownloadEventsFilterInputModel,
  parseOptionalPositiveInt,
  type DownloadEventsFilterFields,
} from "~/lib/download-events-query-model";

interface DownloadEventsSearchInput extends DownloadEventsFilterFields {}

export const DOWNLOAD_EVENT_TYPE_OPTIONS = [
  "all",
  "download.queued",
  "download.imported",
  "download.imported.batch",
  "download.retried",
  "download.status_changed",
  "download.coverage_refined",
  "download.deleted",
  "download.search_missing.queued",
  "download.rss.queued",
] as const;

export function buildDownloadEventsFilterInput(input: DownloadEventsSearchInput) {
  return buildDownloadEventsFilterInputModel(input);
}

export { parseOptionalPositiveInt };
