import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDownloadEventsQuery } from "~/api/system-download-events";
import { createInfiniteLogsQuery } from "~/api/system-logs";
import { createSystemDashboardQuery, createSystemJobsQuery } from "~/api/system-config";
import { LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS } from "~/domain/download/events-search";
import { useDownloadEventsSearchState } from "~/features/downloads/use-download-events-search-state";
import type { LogsFilterParams } from "~/features/logs/use-logs-filters";

interface UseLogsQueriesOptions {
  logsParams: LogsFilterParams;
  search: Record<string, string | undefined>;
  updateSearch: (patch: Partial<Record<string, string>>) => void;
}

export function useLogsQueries(options: UseLogsQueriesOptions) {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const logsQuery = createInfiniteLogsQuery(
    options.logsParams.level,
    options.logsParams.eventType,
    options.logsParams.startDate,
    options.logsParams.endDate,
  );
  const jobsQuery = createSystemJobsQuery();
  const dashboardQuery = createSystemDashboardQuery();

  const downloadEventsSearchState = useDownloadEventsSearchState({
    keys: LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
    search: options.search,
    updateSearch: options.updateSearch,
  });
  const downloadEventsQuery = createDownloadEventsQuery(downloadEventsSearchState.queryInput);

  const allLogs = useMemo(
    () => logsQuery.data?.pages.flatMap((page) => page.logs) ?? [],
    [logsQuery.data?.pages],
  );
  const canGoToPreviousDownloadEventsPage = Boolean(downloadEventsQuery.data?.prev_cursor);
  const canGoToNextDownloadEventsPage = Boolean(downloadEventsQuery.data?.next_cursor);

  const queriesRef = useRef({ logsQuery, downloadEventsQuery, dashboardQuery, jobsQuery });
  queriesRef.current = { logsQuery, downloadEventsQuery, dashboardQuery, jobsQuery };

  const refreshAll = useCallback(() => {
    const q = queriesRef.current;
    void q.logsQuery.refetch();
    void q.downloadEventsQuery.refetch();
    void q.dashboardQuery.refetch();
    void q.jobsQuery.refetch();
  }, []);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const interval = setInterval(refreshAll, 3000);
    return () => {
      clearInterval(interval);
    };
  }, [autoRefresh, refreshAll]);

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
