import { useCallback, useMemo, useState } from "react";
import { useDownloadEventsQuery } from "~/api/system-download-events";
import { useInfiniteLogsQuery } from "~/api/system-logs";
import { useSystemDashboardQuery, useSystemJobsQuery } from "~/api/system-config";
import { LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS } from "~/domain/download/events-search";
import { useDownloadEventsSearchState } from "~/features/downloads/use-download-events-search-state";
import type { LogsFilterParams } from "~/features/logs/use-logs-filters";

const AUTO_REFRESH_STORAGE_KEY = "bakarr.logs.auto-refresh";

function readStoredAutoRefresh(): boolean {
  try {
    return localStorage.getItem(AUTO_REFRESH_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function storeAutoRefresh(value: boolean) {
  try {
    localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Persistence is best-effort; the toggle still works within the session.
  }
}

interface UseLogsQueriesOptions {
  logsParams: LogsFilterParams;
  search: Record<string, string | undefined>;
  updateSearch: (patch: Partial<Record<string, string>>) => void;
}

export function useLogsQueries(options: UseLogsQueriesOptions) {
  const [autoRefresh, setAutoRefreshState] = useState(readStoredAutoRefresh);

  const setAutoRefresh = useCallback((next: boolean) => {
    setAutoRefreshState(next);
    storeAutoRefresh(next);
  }, []);

  const refetchInterval = autoRefresh ? 3000 : false;

  const logsQuery = useInfiniteLogsQuery(
    options.logsParams.level,
    options.logsParams.eventType,
    options.logsParams.startDate,
    options.logsParams.endDate,
    { refetchInterval },
  );
  const jobsQuery = useSystemJobsQuery({ refetchInterval });
  const dashboardQuery = useSystemDashboardQuery({ refetchInterval });

  const downloadEventsSearchState = useDownloadEventsSearchState({
    keys: LOGS_DOWNLOAD_EVENTS_SEARCH_KEYS,
    search: options.search,
    updateSearch: options.updateSearch,
  });
  const downloadEventsQuery = useDownloadEventsQuery(downloadEventsSearchState.queryInput, {
    refetchInterval,
  });

  const allLogs = useMemo(
    () => logsQuery.data?.pages.flatMap((page) => page.logs) ?? [],
    [logsQuery.data?.pages],
  );
  const canGoToPreviousDownloadEventsPage = Boolean(downloadEventsQuery.data?.prev_cursor);
  const canGoToNextDownloadEventsPage = Boolean(downloadEventsQuery.data?.next_cursor);

  const refreshAll = useCallback(() => {
    void logsQuery.refetch();
    void downloadEventsQuery.refetch();
    void dashboardQuery.refetch();
    void jobsQuery.refetch();
  }, [dashboardQuery, downloadEventsQuery, jobsQuery, logsQuery]);

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
