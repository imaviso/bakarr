import type { Accessor } from "solid-js";
import { useLogsActions } from "~/features/logs/use-logs-actions";
import { useLogsFilters } from "~/features/logs/use-logs-filters";
import { useLogsQueries } from "~/features/logs/use-logs-queries";
import { formatUiTimestamp } from "~/lib/date-time";

export function formatLogTimestamp(createdAt: string): string {
  return formatUiTimestamp(createdAt);
}

interface UseLogsRouteStateOptions {
  search: Accessor<Record<string, string | undefined>>;
  updateSearch: (patch: Partial<Record<string, string>>) => void;
}

export function useLogsRouteState(options: UseLogsRouteStateOptions) {
  const filters = useLogsFilters({
    search: options.search,
    updateSearch: options.updateSearch,
  });

  const queries = useLogsQueries({
    logsParams: filters.logsParams,
    search: options.search,
    updateSearch: options.updateSearch,
  });

  const actions = useLogsActions({
    logsParams: filters.logsParams,
    updateSearch: options.updateSearch,
    downloadEventsPage: () => ({
      nextCursor: queries.downloadEventsQuery.data?.next_cursor,
      prevCursor: queries.downloadEventsQuery.data?.prev_cursor,
    }),
  });

  return {
    allLogs: queries.allLogs,
    autoRefresh: queries.autoRefresh,
    canGoToNextDownloadEventsPage: queries.canGoToNextDownloadEventsPage,
    canGoToPreviousDownloadEventsPage: queries.canGoToPreviousDownloadEventsPage,
    clearLogs: actions.clearLogs,
    clearLogsWithToast: actions.clearLogsWithToast,
    dashboardQuery: queries.dashboardQuery,
    downloadEventsQuery: queries.downloadEventsQuery,
    downloadEventsSearchState: queries.downloadEventsSearchState,
    exportDownloadEvents: (formatValue: "json" | "csv") =>
      actions.exportDownloadEvents({
        format: formatValue,
        exportInput: queries.downloadEventsSearchState.exportInput(),
      }),
    exportLogs: actions.exportLogs,
    filterStates: filters.filterStates,
    goToNextDownloadEventsPage: actions.goToNextDownloadEventsPage,
    goToPreviousDownloadEventsPage: actions.goToPreviousDownloadEventsPage,
    jobsQuery: queries.jobsQuery,
    lastDownloadEventsExport: actions.lastDownloadEventsExport,
    logsQuery: queries.logsQuery,
    refreshAll: queries.refreshAll,
    selectedDownloadEvent: actions.selectedDownloadEvent,
    selectedLog: actions.selectedLog,
    setAutoRefresh: queries.setAutoRefresh,
    setFilterStates: filters.setFilterStates,
    setSelectedDownloadEvent: actions.setSelectedDownloadEvent,
    setSelectedLog: actions.setSelectedLog,
  };
}
