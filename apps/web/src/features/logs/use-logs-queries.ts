import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import {
  createDownloadEventsQuery,
  createInfiniteLogsQuery,
  createSystemDashboardQuery,
  createSystemJobsQuery,
} from "~/lib/api";
import { LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS } from "~/lib/download-events-search";
import { useDownloadEventsSearchState } from "~/hooks/use-download-events-search-state";
import type { LogsFilterParams } from "~/features/logs/use-logs-filters";

interface UseLogsQueriesOptions {
  logsParams: Accessor<LogsFilterParams>;
  search: Accessor<Record<string, string | undefined>>;
  updateSearch: (patch: Partial<Record<string, string>>) => void;
}

export function useLogsQueries(options: UseLogsQueriesOptions) {
  const [autoRefresh, setAutoRefresh] = createSignal(false);

  const logsQuery = createInfiniteLogsQuery(
    () => options.logsParams().level,
    () => options.logsParams().eventType,
    () => options.logsParams().startDate,
    () => options.logsParams().endDate,
  );
  const jobsQuery = createSystemJobsQuery();
  const dashboardQuery = createSystemDashboardQuery();

  const downloadEventsSearchState = useDownloadEventsSearchState({
    keys: LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
    search: options.search,
    updateSearch: options.updateSearch,
  });
  const downloadEventsQuery = createDownloadEventsQuery(downloadEventsSearchState.queryInput);

  const allLogs = createMemo(() => logsQuery.data?.pages.flatMap((page) => page.logs) ?? []);
  const canGoToPreviousDownloadEventsPage = createMemo(() =>
    Boolean(downloadEventsQuery.data?.prev_cursor),
  );
  const canGoToNextDownloadEventsPage = createMemo(() =>
    Boolean(downloadEventsQuery.data?.next_cursor),
  );

  const refreshAll = () => {
    void logsQuery.refetch();
    void downloadEventsQuery.refetch();
    void dashboardQuery.refetch();
    void jobsQuery.refetch();
  };

  createEffect(() => {
    if (!autoRefresh()) {
      return;
    }

    const interval = setInterval(refreshAll, 3000);
    onCleanup(() => clearInterval(interval));
  });

  return {
    allLogs,
    autoRefresh,
    canGoToNextDownloadEventsPage,
    canGoToPreviousDownloadEventsPage,
    dashboardQuery,
    downloadEventsQuery,
    downloadEventsSearchState,
    jobsQuery,
    logsQuery,
    refreshAll,
    setAutoRefresh,
  };
}
