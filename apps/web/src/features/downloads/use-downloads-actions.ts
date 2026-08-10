import { useSearchMissingMutation, useSyncDownloadsMutation } from "~/api/system-downloads";
import type { DownloadEventsExportInput } from "~/api/contracts";
import {
  createDownloadEventsCursorPatch,
  DOWNLOADS_EVENTS_SEARCH_KEYS,
} from "~/domain/download/events-search";
import { toDownloadsTab } from "~/features/downloads/downloads-search";
import type { DownloadsSearchPatch } from "~/features/downloads/downloads-search";
import { useDownloadEventsExport } from "~/features/downloads/use-download-events-export";

interface UseDownloadsActionsOptions {
  updateSearch: (patch: DownloadsSearchPatch) => void;
  eventsExportInput: DownloadEventsExportInput;
  eventsPage: {
    nextCursor?: string | undefined;
    prevCursor?: string | undefined;
  };
}

export function useDownloadsActions(options: UseDownloadsActionsOptions) {
  const { exportDownloadEvents, lastExport } = useDownloadEventsExport();
  const searchMissing = useSearchMissingMutation();
  const syncDownloads = useSyncDownloadsMutation();

  const handleDownloadEventsExport = (format: "json" | "csv") => {
    exportDownloadEvents(format, options.eventsExportInput);
  };

  const goToPreviousEventsPage = () => {
    options.updateSearch(
      createDownloadEventsCursorPatch(
        DOWNLOADS_EVENTS_SEARCH_KEYS,
        "prev",
        options.eventsPage.prevCursor ?? "",
      ),
    );
  };

  const goToNextEventsPage = () => {
    options.updateSearch(
      createDownloadEventsCursorPatch(
        DOWNLOADS_EVENTS_SEARCH_KEYS,
        "next",
        options.eventsPage.nextCursor ?? "",
      ),
    );
  };

  const triggerSyncDownloads = () => {
    syncDownloads.mutate();
  };

  const triggerSearchMissing = () => {
    searchMissing.mutate(undefined);
  };

  const handleTabChange = (value: string | undefined) => {
    options.updateSearch({ tab: toDownloadsTab(value) });
  };

  return {
    goToNextEventsPage,
    goToPreviousEventsPage,
    handleDownloadEventsExport,
    handleTabChange,
    lastDownloadEventsExport: lastExport,
    searchMissing,
    triggerSearchMissing,
    syncDownloads,
    triggerSyncDownloads,
  };
}
