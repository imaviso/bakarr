import { useSuspenseQuery } from "@tanstack/react-query";
import { useDownloadEventsSearchState } from "~/features/downloads/use-download-events-search-state";
import { useActiveDownloads } from "~/features/downloads/use-active-downloads";
import type {
  DownloadsSearchPatch,
  DownloadsSearchState,
} from "~/features/downloads/downloads-search";
import { createDownloadEventsQuery, downloadHistoryQueryOptions } from "~/api";
import { DOWNLOADS_EVENTS_SEARCH_KEYS } from "~/domain/download/events-search";

interface UseDownloadsQueriesOptions {
  search: DownloadsSearchState;
  updateSearch: (patch: DownloadsSearchPatch) => void;
}

export function useDownloadsQueries(options: UseDownloadsQueriesOptions) {
  const eventsSearchState = useDownloadEventsSearchState({
    keys: DOWNLOADS_EVENTS_SEARCH_KEYS,
    search: options.search,
    updateSearch: options.updateSearch,
  });

  const queue = useActiveDownloads();
  const { data: history } = useSuspenseQuery(downloadHistoryQueryOptions());
  const downloadEventsQuery = createDownloadEventsQuery(eventsSearchState.queryInput);

  const canGoToPreviousEventsPage = Boolean(downloadEventsQuery.data?.prev_cursor);
  const canGoToNextEventsPage = Boolean(downloadEventsQuery.data?.next_cursor);

  return {
    canGoToNextEventsPage,
    canGoToPreviousEventsPage,
    downloadEventsQuery,
    eventsSearchState,
    history,
    queue,
    queueCount: queue.length,
  };
}
