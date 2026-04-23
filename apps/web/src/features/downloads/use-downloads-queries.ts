import { useSuspenseQuery } from "@tanstack/react-query";
import { useDownloadEventsSearchState } from "~/hooks/use-download-events-search-state";
import { useActiveDownloads } from "~/hooks/use-active-downloads";
import type {
  DownloadsSearchPatch,
  DownloadsSearchState,
} from "~/features/downloads/downloads-search";
import { createDownloadEventsQuery, downloadHistoryQueryOptions } from "~/lib/api";
import { DOWNLOADS_EVENTS_SEARCH_KEYS } from "~/lib/download-events-search";

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
