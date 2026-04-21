import { useDownloadsActions } from "~/features/downloads/use-downloads-actions";
import { useDownloadsQueries } from "~/features/downloads/use-downloads-queries";
import type {
  DownloadsSearchPatch,
  DownloadsSearchState,
} from "~/features/downloads/downloads-search";

interface UseDownloadsRouteStateOptions {
  search: DownloadsSearchState;
  updateSearch: (patch: DownloadsSearchPatch) => void;
}

export function useDownloadsRouteState(options: UseDownloadsRouteStateOptions) {
  const queries = useDownloadsQueries({
    search: options.search,
    updateSearch: options.updateSearch,
  });

  const actions = useDownloadsActions({
    updateSearch: options.updateSearch,
    eventsExportInput: queries.eventsSearchState.exportInput,
    eventsPage: {
      nextCursor: queries.downloadEventsQuery.data?.next_cursor,
      prevCursor: queries.downloadEventsQuery.data?.prev_cursor,
    },
  });

  return {
    canGoToNextEventsPage: queries.canGoToNextEventsPage,
    canGoToPreviousEventsPage: queries.canGoToPreviousEventsPage,
    downloadEventsQuery: queries.downloadEventsQuery,
    eventsSearchState: queries.eventsSearchState,
    goToNextEventsPage: actions.goToNextEventsPage,
    goToPreviousEventsPage: actions.goToPreviousEventsPage,
    handleDownloadEventsExport: actions.handleDownloadEventsExport,
    handleTabChange: actions.handleTabChange,
    history: queries.history,
    historyQuery: queries.historyQuery,
    lastDownloadEventsExport: actions.lastDownloadEventsExport,
    queue: queries.queue,
    queueCount: queries.queueCount,
    searchMissing: actions.searchMissing,
    triggerSearchMissing: actions.triggerSearchMissing,
    syncDownloads: actions.syncDownloads,
    triggerSyncDownloads: actions.triggerSyncDownloads,
  };
}
