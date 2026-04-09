import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconDownload,
  IconFileSpreadsheet,
  IconFilter,
  IconInfoCircle,
  IconJson,
  IconRefresh,
  IconTag,
  IconTrash,
} from "@tabler/icons-solidjs";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { format } from "date-fns";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import * as v from "valibot";
import { BackgroundJobCard } from "~/components/logs/background-job-card";
import { DashboardMetricCard } from "~/components/logs/dashboard-metric-card";
import { DownloadEventsList } from "~/components/logs/download-events-list";
import { LogDetailsDialog } from "~/components/logs/log-details-dialog";
import { SystemLogsTable } from "~/components/logs/system-logs-table";
import { DownloadEventsFilters } from "~/components/download-events/download-events-filters";
import { Filter, type FilterColumnConfig, type FilterState } from "~/components/filters";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
import { DownloadEventDetailsDialog } from "~/components/download-event-details-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { useDownloadEventsSearchState } from "~/hooks/use-download-events-search-state";
import {
  createClearLogsMutation,
  createDownloadEventsQuery,
  createInfiniteLogsQuery,
  createSystemDashboardQuery,
  createSystemJobsQuery,
  type DownloadEvent,
  type DownloadEventsExportResult,
  getExportLogsUrl,
  infiniteLogsQueryOptions,
  type SystemLog,
} from "~/lib/api";
import { runDownloadEventsExport } from "~/lib/download-events-export";
import { cn } from "~/lib/utils";

const LogsSearchSchema = v.object({
  download_anime_id: v.optional(v.string(), ""),
  download_cursor: v.optional(v.string(), ""),
  download_direction: v.optional(v.picklist(["next", "prev"]), "next"),
  download_download_id: v.optional(v.string(), ""),
  download_end_date: v.optional(v.string(), ""),
  download_event_type: v.optional(v.string(), "all"),
  download_start_date: v.optional(v.string(), ""),
  download_status: v.optional(v.string(), ""),
});

export const Route = createFileRoute("/_layout/logs")({
  validateSearch: (search) => v.parse(LogsSearchSchema, search),
  loader: ({ context: { queryClient } }) => {
    return queryClient.ensureInfiniteQueryData(
      infiniteLogsQueryOptions(undefined, undefined, undefined, undefined),
    );
  },
  component: LogsPage,
  errorComponent: GeneralError,
});

function formatLogTimestamp(createdAt: string): string {
  const normalized = createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}Z`;
  const date = new Date(candidate);

  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return format(date, "yyyy-MM-dd HH:mm:ss");
}

function LogsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [autoRefresh, setAutoRefresh] = createSignal(false);
  const [lastDownloadEventsExport, setLastDownloadEventsExport] = createSignal<
    DownloadEventsExportResult | undefined
  >(undefined);
  const [selectedDownloadEvent, setSelectedDownloadEvent] = createSignal<DownloadEvent | null>(
    null,
  );
  const [selectedLog, setSelectedLog] = createSignal<SystemLog | null>(null);
  const [filterStates, setFilterStates] = createSignal<FilterState[]>([]);

  // Define filter columns
  const filterColumns: FilterColumnConfig[] = [
    {
      id: "level",
      label: "Level",
      type: "select",
      icon: <IconFilter class="h-4 w-4" />,
      operators: ["is"],
      options: [
        {
          value: "info",
          label: "Info",
          icon: <IconInfoCircle class="h-4 w-4 text-info" />,
        },
        {
          value: "warn",
          label: "Warn",
          icon: <IconAlertTriangle class="h-4 w-4 text-warning" />,
        },
        {
          value: "error",
          label: "Error",
          icon: <IconAlertCircle class="h-4 w-4 text-error" />,
        },
        {
          value: "success",
          label: "Success",
          icon: <IconCheck class="h-4 w-4 text-success" />,
        },
      ],
    },
    {
      id: "eventType",
      label: "Event Type",
      type: "select",
      icon: <IconTag class="h-4 w-4" />,
      operators: ["is"],
      options: [
        { value: "Scan", label: "Scan" },
        { value: "Download", label: "Download" },
        { value: "Import", label: "Import" },
        { value: "Metadata", label: "Metadata" },
        { value: "RSS", label: "RSS" },
        { value: "Error", label: "Error" },
      ],
    },
    {
      id: "startDate",
      label: "Start Date",
      type: "date",
      icon: <IconCalendar class="h-4 w-4" />,
      operators: ["is_after"],
    },
    {
      id: "endDate",
      label: "End Date",
      type: "date",
      icon: <IconCalendar class="h-4 w-4" />,
      operators: ["is_before"],
    },
  ];

  // Convert filter states to API params
  const apiParams = createMemo(() => {
    const params: Record<string, string | undefined> = {};

    for (const filter of filterStates()) {
      const value = Array.isArray(filter.value) ? filter.value[0] : filter.value;
      if (value) {
        if (filter.columnId === "endDate") {
          // Append end of day time to ensure inclusive filtering
          params[filter.columnId] = `${value} 23:59:59`;
        } else if (filter.columnId === "startDate") {
          // Append start of day time for consistency
          params[filter.columnId] = `${value} 00:00:00`;
        } else {
          params[filter.columnId] = value;
        }
      }
    }

    return params;
  });

  // Reactively fetch logs based on filters
  const logsQuery = createInfiniteLogsQuery(
    () => apiParams()["level"],
    () => apiParams()["eventType"],
    () => apiParams()["startDate"],
    () => apiParams()["endDate"],
  );
  const clearLogs = createClearLogsMutation();
  const jobsQuery = createSystemJobsQuery();
  const dashboardQuery = createSystemDashboardQuery();

  const updateDownloadEventSearch = (patch: Partial<ReturnType<typeof search>>) => {
    void navigate({
      to: ".",
      search: { ...search(), ...patch },
      replace: true,
    });
  };

  const downloadEventsSearchState = useDownloadEventsSearchState({
    keys: {
      animeId: "download_anime_id",
      cursor: "download_cursor",
      direction: "download_direction",
      downloadId: "download_download_id",
      endDate: "download_end_date",
      eventType: "download_event_type",
      startDate: "download_start_date",
      status: "download_status",
    },
    search,
    updateSearch: updateDownloadEventSearch,
  });

  const downloadEventsQuery = createDownloadEventsQuery(downloadEventsSearchState.queryInput);

  // Flatten all pages of logs
  const allLogs = createMemo(() => logsQuery.data?.pages.flatMap((page) => page.logs) ?? []);

  // Auto-refresh logic
  createEffect(() => {
    if (!autoRefresh()) return;
    const interval = setInterval(() => {
      void logsQuery.refetch();
      void downloadEventsQuery.refetch();
      void dashboardQuery.refetch();
    }, 3000);
    onCleanup(() => clearInterval(interval));
  });

  const handleExport = (exportFormat: "json" | "csv") => {
    const url = getExportLogsUrl(
      apiParams()["level"],
      apiParams()["eventType"],
      apiParams()["startDate"],
      apiParams()["endDate"],
      exportFormat,
    );
    globalThis.open(url, "_blank");
  };

  const handleDownloadEventsExport = (exportFormat: "json" | "csv") => {
    void runDownloadEventsExport({
      format: exportFormat,
      input: downloadEventsSearchState.exportInput(),
      onComplete: (result) => {
        setLastDownloadEventsExport(result);
      },
    });
  };

  return (
    <div class="flex flex-col flex-1 min-h-0 gap-6">
      <PageHeader title="System Logs" subtitle="View, filter, and export system events and errors">
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-2">
            <Switch checked={autoRefresh()} onChange={setAutoRefresh} id="auto-refresh" />
            <label
              for="auto-refresh"
              class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Auto-Refresh
            </label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void logsQuery.refetch();
              void downloadEventsQuery.refetch();
              void dashboardQuery.refetch();
            }}
            disabled={logsQuery.isRefetching}
          >
            <IconRefresh class={cn("h-4 w-4", logsQuery.isRefetching && "animate-spin")} />
            Refresh
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger as={Button} variant="outline" size="sm">
              <IconDownload class="h-4 w-4" />
              Export
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport("json")}>
                <IconJson class="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                <IconFileSpreadsheet class="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialog>
            <AlertDialogTrigger as={Button} variant="destructive" size="sm">
              <IconTrash class="h-4 w-4" />
              Clear Logs
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Logs?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete all system logs from
                  the database.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => clearLogs.mutate()}
                >
                  Clear Logs
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PageHeader>

      <Filter.Provider columns={filterColumns} value={filterStates} onChange={setFilterStates}>
        <Filter.Root>
          <div class="flex flex-wrap items-center gap-2">
            <Filter.Menu />
            <Filter.List />
            <Filter.Actions />
          </div>
        </Filter.Root>
      </Filter.Provider>

      <Card class="border-dashed">
        <div class="p-4 border-b border-border/60">
          <h2 class="text-sm font-medium text-foreground">Ops Summary</h2>
          <p class="text-xs text-muted-foreground mt-1">High-level download and worker health</p>
        </div>
        <div class="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Show
            when={dashboardQuery.data}
            fallback={<For each={[1, 2, 3, 4, 5]}>{() => <Skeleton class="h-20 w-full" />}</For>}
          >
            {(dashboard) => (
              <>
                <DashboardMetricCard label="Queued" value={dashboard().queued_downloads} />
                <DashboardMetricCard label="Active" value={dashboard().active_downloads} />
                <DashboardMetricCard
                  label="Failed"
                  value={dashboard().failed_downloads}
                  highlight="text-error"
                />
                <DashboardMetricCard
                  label="Imported"
                  value={dashboard().imported_downloads}
                  highlight="text-success"
                />
                <DashboardMetricCard
                  label="Running Jobs"
                  value={dashboard().running_jobs}
                  highlight="text-info"
                />
              </>
            )}
          </Show>
        </div>
      </Card>

      <Card class="border-dashed">
        <div class="p-4 border-b border-border/60">
          <h2 class="text-sm font-medium text-foreground">Background Jobs</h2>
          <p class="text-xs text-muted-foreground mt-1">Current scheduler and worker visibility</p>
        </div>
        <div class="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Show
            when={!jobsQuery.isLoading}
            fallback={<For each={[1, 2, 3, 4]}>{() => <Skeleton class="h-24 w-full" />}</For>}
          >
            <Show
              when={(jobsQuery.data?.length ?? 0) > 0}
              fallback={<div class="text-sm text-muted-foreground">No background job data yet</div>}
            >
              <For each={jobsQuery.data}>
                {(job) => <BackgroundJobCard job={job} formatTimestamp={formatLogTimestamp} />}
              </For>
            </Show>
          </Show>
        </div>
      </Card>

      <Card class="border-dashed">
        <div class="p-4 border-b border-border/60">
          <div class="flex flex-col gap-3">
            <div>
              <h2 class="text-sm font-medium text-foreground">Recent Download Events</h2>
              <p class="text-xs text-muted-foreground mt-1">
                Latest queued, retried, reconciled, and imported download actions
              </p>
            </div>
            <DownloadEventsFilters
              eventTypeSelectId="download-event-type"
              value={downloadEventsSearchState.filterValue()}
              onFieldChange={downloadEventsSearchState.updateFilter}
              onApplyPreset={downloadEventsSearchState.applyDateRangePreset}
              activePreset={downloadEventsSearchState.activePreset()}
              onClear={downloadEventsSearchState.resetFilters}
              clearLabel="Reset"
              onExport={handleDownloadEventsExport}
              showPagination
              onPrevious={() =>
                updateDownloadEventSearch({
                  download_cursor: downloadEventsQuery.data?.prev_cursor ?? "",
                  download_direction: "prev",
                })
              }
              previousDisabled={!downloadEventsQuery.data?.prev_cursor}
              onNext={() =>
                updateDownloadEventSearch({
                  download_cursor: downloadEventsQuery.data?.next_cursor ?? "",
                  download_direction: "next",
                })
              }
              nextDisabled={!downloadEventsQuery.data?.has_more}
            />
            <Show when={lastDownloadEventsExport()?.truncated}>
              <div class="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                Last export was truncated: exported
                {lastDownloadEventsExport()?.exported} of
                {lastDownloadEventsExport()?.total} events (limit{" "}
                {lastDownloadEventsExport()?.limit}).
              </div>
            </Show>
          </div>
        </div>
        <Show
          when={downloadEventsQuery.data?.events.length}
          fallback={<div class="p-4 text-sm text-muted-foreground">No recent download events</div>}
        >
          <div class="px-4 pt-3 pb-1 text-xs text-muted-foreground">
            Showing {downloadEventsQuery.data?.events.length ?? 0} of{" "}
            {downloadEventsQuery.data?.total ?? 0} events
          </div>
          <DownloadEventsList
            events={downloadEventsQuery.data?.events ?? []}
            formatTimestamp={formatLogTimestamp}
            onSelectEvent={setSelectedDownloadEvent}
          />
        </Show>
      </Card>

      <Card class="border-primary/20 flex-1 min-h-0 flex flex-col overflow-hidden">
        <SystemLogsTable
          logs={allLogs()}
          isLoading={logsQuery.isLoading}
          isError={logsQuery.isError}
          hasNextPage={logsQuery.hasNextPage}
          isFetchingNextPage={logsQuery.isFetchingNextPage}
          formatTimestamp={formatLogTimestamp}
          onFetchNextPage={() => {
            void logsQuery.fetchNextPage();
          }}
          onSelectLog={setSelectedLog}
        />
      </Card>

      <LogDetailsDialog
        log={selectedLog()}
        formatTimestamp={formatLogTimestamp}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLog(null);
          }
        }}
      />

      <DownloadEventDetailsDialog
        event={selectedDownloadEvent()}
        formatTimestamp={formatLogTimestamp}
        onOpenChange={(open) => !open && setSelectedDownloadEvent(null)}
      />
    </div>
  );
}
