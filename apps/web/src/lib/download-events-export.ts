import { toast } from "sonner";
import {
  type DownloadEventsExportInput,
  type DownloadEventsExportResult,
  exportDownloadEvents,
} from "~/lib/api";
import {
  buildDownloadEventsExportInput,
  type DownloadEventsExportFields,
} from "~/lib/download-events-export-input";

export { buildDownloadEventsExportInput, type DownloadEventsExportFields };

export interface DownloadEventsExportOptions {
  format: "json" | "csv";
  input: DownloadEventsExportInput;
  onComplete?: (result: DownloadEventsExportResult) => void;
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
