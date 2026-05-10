import { useSuspenseQuery } from "@tanstack/react-query";
import { useDownloadEventsSearchState } from "~/features/downloads/use-download-events-search-state";
import type {
  DownloadsSearchPatch,
  DownloadsSearchState,
} from "~/features/downloads/downloads-search";
import { useDownloadEventsQuery } from "~/api/system-download-events";
import { downloadHistoryQueryOptions, downloadQueueQueryOptions } from "~/api/system-downloads";
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

  const { data: queue } = useSuspenseQuery(downloadQueueQueryOptions());
  const { data: history } = useSuspenseQuery(downloadHistoryQueryOptions());
  const downloadEventsQuery = useDownloadEventsQuery(eventsSearchState.queryInput);

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
