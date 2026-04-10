import type { DownloadEventsExportInput } from "~/lib/api";
import {
  buildDownloadEventsExportInput as buildDownloadEventsExportInputModel,
  type DownloadEventsQueryFields,
} from "~/lib/download-events-query-model";

export interface DownloadEventsExportFields extends DownloadEventsQueryFields {}

export function buildDownloadEventsExportInput(
  fields: DownloadEventsExportFields,
  options?: {
    limit?: number | undefined;
    order?: "asc" | "desc" | undefined;
  },
): DownloadEventsExportInput {
  const normalizedOptions = {
    ...(options?.limit === undefined ? {} : { limit: options.limit }),
    ...(options?.order === undefined ? {} : { order: options.order }),
  };

  return buildDownloadEventsExportInputModel(fields, normalizedOptions);
}
