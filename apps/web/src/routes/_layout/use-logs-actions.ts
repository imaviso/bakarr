import { createSignal } from "solid-js";
import type { Accessor } from "solid-js";
import type { DownloadEvent, DownloadEventsExportResult, SystemLog } from "~/lib/api";
import { createClearLogsMutation, getExportLogsUrl } from "~/lib/api";
import {
  createDownloadEventsCursorPatch,
  LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
} from "~/lib/download-events-search";
import { runDownloadEventsExport } from "~/lib/download-events-export";
import type { DownloadEventsExportInput } from "~/lib/api";
import type { LogsFilterParams } from "~/routes/_layout/use-logs-filters";

interface UseLogsActionsOptions {
  logsParams: Accessor<LogsFilterParams>;
  updateSearch: (patch: Partial<Record<string, string>>) => void;
  downloadEventsPage: Accessor<{
    nextCursor?: string | undefined;
    prevCursor?: string | undefined;
  }>;
}

export function useLogsActions(options: UseLogsActionsOptions) {
  const clearLogs = createClearLogsMutation();
  const [lastDownloadEventsExport, setLastDownloadEventsExport] = createSignal<
    DownloadEventsExportResult | undefined
  >(undefined);
  const [selectedDownloadEvent, setSelectedDownloadEvent] = createSignal<DownloadEvent | null>(
    null,
  );
  const [selectedLog, setSelectedLog] = createSignal<SystemLog | null>(null);

  const clearLogsWithToast = () => clearLogs.mutate();

  const exportLogs = (formatValue: "json" | "csv") => {
    const logsParams = options.logsParams();
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
    void runDownloadEventsExport({
      format: input.format,
      input: input.exportInput,
      onComplete: (result) => {
        setLastDownloadEventsExport(result);
      },
    });
  };

  const goToPreviousDownloadEventsPage = () => {
    options.updateSearch(
      createDownloadEventsCursorPatch(
        LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
        "prev",
        options.downloadEventsPage().prevCursor ?? "",
      ),
    );
  };

  const goToNextDownloadEventsPage = () => {
    options.updateSearch(
      createDownloadEventsCursorPatch(
        LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
        "next",
        options.downloadEventsPage().nextCursor ?? "",
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
