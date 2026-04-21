import { useMemo } from "react";
import { useDownloadEventsSearchState } from "~/hooks/use-download-events-search-state";
import { useActiveDownloads } from "~/hooks/use-active-downloads";
import type {
  DownloadsSearchPatch,
  DownloadsSearchState,
} from "~/features/downloads/downloads-search";
import { createDownloadEventsQuery, createDownloadHistoryQuery } from "~/lib/api";
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
  const historyQuery = createDownloadHistoryQuery();
  const downloadEventsQuery = createDownloadEventsQuery(eventsSearchState.queryInput);

  const queueCount = useMemo(() => queue.length, [queue]);
  const history = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);
  const canGoToPreviousEventsPage = useMemo(
    () => Boolean(downloadEventsQuery.data?.prev_cursor),
    [downloadEventsQuery.data?.prev_cursor],
  );
  const canGoToNextEventsPage = useMemo(
    () => Boolean(downloadEventsQuery.data?.next_cursor),
    [downloadEventsQuery.data?.next_cursor],
  );

  return {
    canGoToNextEventsPage,
    canGoToPreviousEventsPage,
    downloadEventsQuery,
    eventsSearchState,
    history,
    historyQuery,
    queue,
    queueCount,
  };
}
