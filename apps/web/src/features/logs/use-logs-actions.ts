import { useState } from "react";
import { toast } from "sonner";
import type { DownloadEvent, DownloadEventsExportResult, SystemLog } from "~/api/contracts";
import { useClearLogsMutation, getExportLogsUrl } from "~/api/system-logs";
import { useDownloadEventsExportMutation } from "~/api/system-download-events";
import { errorMessage } from "~/api/effect/errors";
import {
  createDownloadEventsCursorPatch,
  LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
} from "~/domain/download/events-search";
import type { DownloadEventsExportInput } from "~/api/contracts";
import type { LogsFilterParams } from "~/features/logs/use-logs-filters";

interface UseLogsActionsOptions {
  logsParams: LogsFilterParams;
  updateSearch: (patch: Partial<Record<string, string>>) => void;
  downloadEventsPage: {
    nextCursor?: string | undefined;
    prevCursor?: string | undefined;
  };
}

export function useLogsActions(options: UseLogsActionsOptions) {
  const clearLogs = useClearLogsMutation();
  const [lastDownloadEventsExport, setLastDownloadEventsExport] = useState<
    DownloadEventsExportResult | undefined
  >(undefined);
  const [selectedDownloadEvent, setSelectedDownloadEvent] = useState<DownloadEvent | null>(null);
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);
  const exportDownloadEventsMutation = useDownloadEventsExportMutation();

  const clearLogsWithToast = () => clearLogs.mutate();

  const exportLogs = (formatValue: "json" | "csv") => {
    const logsParams = options.logsParams;
    const url = getExportLogsUrl(
      logsParams.level,
      logsParams.eventType,
      logsParams.startDate,
      logsParams.endDate,
      formatValue,
    );

    const exportWindow = globalThis.open(url, "_blank", "noopener,noreferrer");
    if (exportWindow) {
      exportWindow.opener = null;
    }
  };

  const exportDownloadEvents = (input: {
    format: "json" | "csv";
    exportInput: DownloadEventsExportInput;
  }) => {
    const exportPromise = exportDownloadEventsMutation
      .mutateAsync({ filter: input.exportInput, format: input.format })
      .then((result) => {
        setLastDownloadEventsExport(result);
        return result;
      });

    toast.promise(exportPromise, {
      error: (error) => errorMessage(error, "Failed to export download events"),
      loading: `Exporting ${input.format.toUpperCase()} download events...`,
      success: (result) =>
        result.truncated
          ? `Exported ${result.exported} of ${result.total} events (truncated at ${result.limit})`
          : `Exported ${result.exported} download events`,
    });
  };

  const goToPreviousDownloadEventsPage = () => {
    options.updateSearch(
      createDownloadEventsCursorPatch(
        LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
        "prev",
        options.downloadEventsPage.prevCursor ?? "",
      ),
    );
  };

  const goToNextDownloadEventsPage = () => {
    options.updateSearch(
      createDownloadEventsCursorPatch(
        LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
        "next",
        options.downloadEventsPage.nextCursor ?? "",
      ),
    );
  };

  return {
    clearLogs,
    clearLogsWithToast,
    exportDownloadEvents,
    exportLogs,
    goToNextDownloadEventsPage,
    goToPreviousDownloadEventsPage,
    lastDownloadEventsExport,
    selectedDownloadEvent,
    selectedLog,
    setSelectedDownloadEvent,
    setSelectedLog,
  };
}
