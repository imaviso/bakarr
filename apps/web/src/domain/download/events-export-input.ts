import type { DownloadEventsExportInput } from "~/api/contracts";
import {
  buildDownloadEventsExportInput as buildDownloadEventsExportInputModel,
  type DownloadEventsQueryFields,
} from "~/domain/download/events-query-model";

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
