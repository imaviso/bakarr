import { useState } from "react";
import type { DownloadEvent, SystemLog } from "@/api/contracts";
import { useClearLogsMutation, getExportLogsUrl } from "@/api/system-logs";
import {
  createDownloadEventsCursorPatch,
  LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
} from "@/domain/download/events-search";
import { useDownloadEventsExport } from "@/features/downloads/use-download-events-export";
import type { LogsFilterParams } from "@/features/logs/use-logs-filters";

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
  const { exportDownloadEvents, lastExport } = useDownloadEventsExport();
  const [selectedDownloadEvent, setSelectedDownloadEvent] = useState<DownloadEvent | null>(null);
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

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
    exportDownloadEvents,
    exportLogs,
    goToNextDownloadEventsPage,
    goToPreviousDownloadEventsPage,
    lastDownloadEventsExport: lastExport,
    selectedDownloadEvent,
    selectedLog,
    setSelectedDownloadEvent,
    setSelectedLog,
  };
}
