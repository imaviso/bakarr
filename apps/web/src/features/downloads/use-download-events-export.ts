import { useState } from "react";
import { toast } from "sonner";
import { useDownloadEventsExportMutation } from "~/api/system-download-events";
import type { DownloadEventsExportInput, DownloadEventsExportResult } from "~/api/contracts";
import { errorMessage } from "~/api/effect/errors";

/**
 * Download-events export with toast + last-result tracking.
 *
 * Shared by the downloads page, logs page, and the events dialog — they all
 * run the same mutation, show the same toast copy, and surface the truncated
 * result for a warning banner.
 */
export function useDownloadEventsExport() {
  const exportMutation = useDownloadEventsExportMutation();
  const [lastExport, setLastExport] = useState<DownloadEventsExportResult | undefined>(undefined);

  const exportDownloadEvents = (format: "json" | "csv", filter: DownloadEventsExportInput) => {
    const exportPromise = exportMutation
      .mutateAsync({ filter, format })
      .then((result) => {
        setLastExport(result);
        return result;
      });

    toast.promise(exportPromise, {
      error: (error) => errorMessage(error, "Failed to export download events"),
      loading: `Exporting ${format.toUpperCase()} download events...`,
      success: (result) =>
        result.truncated
          ? `Exported ${result.exported} of ${result.total} events (truncated at ${result.limit})`
          : `Exported ${result.exported} download events`,
    });
  };

  return { exportDownloadEvents, lastExport };
}
