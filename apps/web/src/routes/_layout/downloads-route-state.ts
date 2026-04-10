import type { Accessor } from "solid-js";
import { useDownloadsActions } from "~/routes/_layout/use-downloads-actions";
import { useDownloadsQueries } from "~/routes/_layout/use-downloads-queries";
import type { DownloadsSearchPatch, DownloadsSearchState } from "~/routes/_layout/downloads-search";

interface UseDownloadsRouteStateOptions {
  search: Accessor<DownloadsSearchState>;
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
    eventsPage: () => ({
      nextCursor: queries.downloadEventsQuery.data?.next_cursor,
      prevCursor: queries.downloadEventsQuery.data?.prev_cursor,
    }),
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
    searchMissingWithToast: actions.searchMissingWithToast,
    syncDownloads: actions.syncDownloads,
    syncDownloadsWithToast: actions.syncDownloadsWithToast,
  };
}
