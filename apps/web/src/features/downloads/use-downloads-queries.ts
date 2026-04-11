import { createMemo, type Accessor } from "solid-js";
import { useDownloadEventsSearchState } from "~/hooks/use-download-events-search-state";
import { useActiveDownloads } from "~/hooks/use-active-downloads";
import type {
  DownloadsSearchPatch,
  DownloadsSearchState,
} from "~/features/downloads/downloads-search";
import { createDownloadEventsQuery, createDownloadHistoryQuery } from "~/lib/api";
import { DOWNLOADS_EVENTS_SEARCH_KEYS } from "~/lib/download-events-search";

interface UseDownloadsQueriesOptions {
  search: Accessor<DownloadsSearchState>;
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

  const queueCount = createMemo(() => queue.length);
  const history = createMemo(() => historyQuery.data ?? []);
  const canGoToPreviousEventsPage = createMemo(() =>
    Boolean(downloadEventsQuery.data?.prev_cursor),
  );
  const canGoToNextEventsPage = createMemo(() => Boolean(downloadEventsQuery.data?.next_cursor));

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
