import {
  buildDownloadEventsFilterInput as buildDownloadEventsFilterInputModel,
  parseOptionalPositiveInt,
  type DownloadEventsFilterFields,
} from "~/lib/download-events-query-model";
import { DOWNLOAD_EVENT_TYPE_FILTER_OPTIONS } from "~/lib/api";

interface DownloadEventsSearchInput extends DownloadEventsFilterFields {}

export const DOWNLOAD_EVENT_TYPE_OPTIONS = DOWNLOAD_EVENT_TYPE_FILTER_OPTIONS;

export function buildDownloadEventsFilterInput(input: DownloadEventsSearchInput) {
  return buildDownloadEventsFilterInputModel(input);
}

export { parseOptionalPositiveInt };
