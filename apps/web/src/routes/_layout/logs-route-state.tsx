import { format } from "date-fns";
import type { Accessor } from "solid-js";
import { useLogsActions } from "~/routes/_layout/use-logs-actions";
import { useLogsFilters } from "~/routes/_layout/use-logs-filters";
import { useLogsQueries } from "~/routes/_layout/use-logs-queries";

export function formatLogTimestamp(createdAt: string): string {
  const normalized = createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}Z`;
  const date = new Date(candidate);

  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return format(date, "yyyy-MM-dd HH:mm:ss");
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
