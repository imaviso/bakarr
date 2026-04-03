import { toast } from "solid-sonner";
import {
  type DownloadEventsExportInput,
  type DownloadEventsExportResult,
  exportDownloadEvents,
} from "~/lib/api";

export interface DownloadEventsExportFields {
  animeId: string;
  downloadId: string;
  endDate: string;
  eventType: string;
  startDate: string;
  status: string;
}

export interface DownloadEventsExportOptions {
  format: "json" | "csv";
  input: DownloadEventsExportInput;
  onComplete?: (result: DownloadEventsExportResult) => void;
}

function parseOptionalPositiveInt(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildDownloadEventsExportInput(
  fields: DownloadEventsExportFields,
  options?: {
    limit?: number;
    order?: "asc" | "desc";
  },
): DownloadEventsExportInput {
  return {
    animeId: parseOptionalPositiveInt(fields.animeId),
    downloadId: parseOptionalPositiveInt(fields.downloadId),
    endDate: fields.endDate || undefined,
    eventType: fields.eventType === "all" ? undefined : fields.eventType,
    limit: options?.limit ?? 10_000,
    order: options?.order ?? "desc",
    startDate: fields.startDate || undefined,
    status: fields.status || undefined,
  };
}

export function runDownloadEventsExport(options: DownloadEventsExportOptions) {
  const exportPromise = exportDownloadEvents(options.input, options.format).then((result) => {
    options.onComplete?.(result);
    return result;
  });

  toast.promise(exportPromise, {
    loading: `Exporting ${options.format.toUpperCase()} download events...`,
    success: (result) =>
      result.truncated
        ? `Exported ${result.exported} of ${result.total} events (truncated at ${result.limit})`
        : `Exported ${result.exported} download events`,
    error: (error) => `Failed to export download events: ${error.message}`,
  });

  return exportPromise;
}
