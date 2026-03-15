import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconDownload,
  IconEye,
  IconFileSpreadsheet,
  IconFilter,
  IconInfoCircle,
  IconJson,
  IconLoader,
  IconRefresh,
  IconTag,
  IconTrash,
} from "@tabler/icons-solidjs";
import { createFileRoute } from "@tanstack/solid-router";
import { format } from "date-fns";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import {
  Filter,
  type FilterColumnConfig,
  type FilterState,
} from "~/components/filters";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  type BackgroundJobStatus,
  createClearLogsMutation,
  createInfiniteLogsQuery,
  createSystemDashboardQuery,
  createSystemJobsQuery,
  type DownloadEvent,
  getExportLogsUrl,
  infiniteLogsQueryOptions,
  type SystemLog,
} from "~/lib/api";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_layout/logs")({
  loader: ({ context: { queryClient } }) => {
    return queryClient.ensureInfiniteQueryData(
      infiniteLogsQueryOptions(undefined, undefined, undefined, undefined),
    );
  },
  component: LogsPage,
  errorComponent: GeneralError,
});

function formatLogTimestamp(createdAt: string): string {
  const normalized = createdAt.includes("T")
    ? createdAt
    : createdAt.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}Z`;
  const date = new Date(candidate);

  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return format(date, "yyyy-MM-dd HH:mm:ss");
}

function LogsPage() {
  let logsScrollRef!: HTMLDivElement;
  const [autoRefresh, setAutoRefresh] = createSignal(false);
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
      const value = Array.isArray(filter.value)
        ? filter.value[0]
        : filter.value;
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
    () => apiParams().level,
    () => apiParams().eventType,
    () => apiParams().startDate,
    () => apiParams().endDate,
  );
  const clearLogs = createClearLogsMutation();
  const jobsQuery = createSystemJobsQuery();
  const dashboardQuery = createSystemDashboardQuery();

  // Flatten all pages of logs
  const allLogs = createMemo(
    () => logsQuery.data?.pages.flatMap((page) => page.logs) ?? [],
  );

  // Auto-refresh logic
  createEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (autoRefresh()) {
      interval = setInterval(() => {
        logsQuery.refetch();
      }, 3000);
    }
    return () => clearInterval(interval);
  });

  const rowVirtualizer = createVirtualizer({
    get count() {
      return allLogs().length;
    },
    estimateSize: () => 52,
    overscan: 10,
    getScrollElement: () => logsScrollRef,
  });

  const logsPaddingTop = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    return items.length > 0 ? items[0].start : 0;
  });
  const logsPaddingBottom = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    return items.length > 0
      ? rowVirtualizer.getTotalSize() - items[items.length - 1].end
      : 0;
  });

  // Auto-fetch next page when approaching the end
  createEffect(() => {
    const items = rowVirtualizer.getVirtualItems();
    if (items.length === 0) return;
    const lastItem = items[items.length - 1];
    if (
      lastItem.index >= allLogs().length - 20 &&
      logsQuery.hasNextPage &&
      !logsQuery.isFetchingNextPage
    ) {
      logsQuery.fetchNextPage();
    }
  });

  const handleExport = (format: "json" | "csv") => {
    const url = getExportLogsUrl(
      apiParams().level,
      apiParams().eventType,
      apiParams().startDate,
      apiParams().endDate,
      format,
    );
    globalThis.open(url, "_blank");
  };

  // Custom color classes
  const getLevelColorClass = (level: string) => {
    switch (level.toLowerCase()) {
      case "error":
        return "bg-error/15 text-error hover:bg-error/25 border-error/20";
      case "warn":
        return "bg-warning/15 text-warning hover:bg-warning/25 border-warning/20";
      case "success":
        return "bg-success/15 text-success hover:bg-success/25 border-success/20";
      case "info":
        return "bg-info/15 text-info hover:bg-info/25 border-info/20";
      default:
        return "";
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case "error":
        return <IconAlertCircle class="h-3.5 w-3.5 mr-1" />;
      case "warn":
        return <IconAlertTriangle class="h-3.5 w-3.5 mr-1" />;
      case "success":
        return <IconCheck class="h-3.5 w-3.5 mr-1" />;
      case "info":
        return <IconInfoCircle class="h-3.5 w-3.5 mr-1" />;
      default:
        return <IconInfoCircle class="h-3.5 w-3.5 mr-1" />;
    }
  };

  return (
    <div class="flex flex-col flex-1 min-h-0 gap-6">
      <PageHeader
        title="System Logs"
        subtitle="View, filter, and export system events and errors"
      >
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-2">
            <Switch
              checked={autoRefresh()}
              onChange={setAutoRefresh}
              id="auto-refresh"
            />
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
            onClick={() => logsQuery.refetch()}
            disabled={logsQuery.isRefetching}
          >
            <IconRefresh
              class={cn(
                "h-4 w-4",
                logsQuery.isRefetching && "animate-spin",
              )}
            />
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
                  This action cannot be undone. This will permanently delete all
                  system logs from the database.
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

      <Filter.Provider
        columns={filterColumns}
        value={filterStates()}
        onChange={setFilterStates}
      >
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
          <p class="text-xs text-muted-foreground mt-1">
            High-level download and worker health
          </p>
        </div>
        <div class="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Show
            when={dashboardQuery.data}
            fallback={
              <For each={[1, 2, 3, 4, 5]}>
                {() => <Skeleton class="h-20 w-full" />}
              </For>
            }
          >
            {(dashboard) => (
              <>
                <DashboardMetricCard
                  label="Queued"
                  value={dashboard().queued_downloads}
                />
                <DashboardMetricCard
                  label="Active"
                  value={dashboard().active_downloads}
                />
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
          <p class="text-xs text-muted-foreground mt-1">
            Current scheduler and worker visibility
          </p>
        </div>
        <div class="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Show
            when={!jobsQuery.isLoading}
            fallback={
              <For each={[1, 2, 3, 4]}>
                {() => <Skeleton class="h-24 w-full" />}
              </For>
            }
          >
            <Show
              when={(jobsQuery.data?.length ?? 0) > 0}
              fallback={
                <div class="text-sm text-muted-foreground">
                  No background job data yet
                </div>
              }
            >
              <For each={jobsQuery.data}>
                {(job) => <BackgroundJobCard job={job} />}
              </For>
            </Show>
          </Show>
        </div>
      </Card>

      <Card class="border-dashed">
        <div class="p-4 border-b border-border/60">
          <h2 class="text-sm font-medium text-foreground">
            Recent Download Events
          </h2>
          <p class="text-xs text-muted-foreground mt-1">
            Latest queued, retried, reconciled, and imported download actions
          </p>
        </div>
        <div class="p-4 space-y-3">
          <Show
            when={dashboardQuery.data?.recent_download_events?.length}
            fallback={
              <div class="text-sm text-muted-foreground">
                No recent download events
              </div>
            }
          >
            <For each={dashboardQuery.data?.recent_download_events ?? []}>
              {(event) => <DownloadEventRow event={event} />}
            </For>
          </Show>
        </div>
      </Card>

      <Card class="border-primary/20 flex-1 min-h-0 flex flex-col overflow-hidden">
        <div ref={logsScrollRef} class="overflow-y-auto flex-1">
          <Table>
            <TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
              <TableRow class="hover:bg-transparent border-none">
                <TableHead class="w-[160px]">Timestamp</TableHead>
                <TableHead class="w-[100px]">Level</TableHead>
                <TableHead class="w-[120px]">Source</TableHead>
                <TableHead>Message</TableHead>
                <TableHead class="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <Show
                when={!logsQuery.isLoading}
                fallback={
                  <For each={[1, 2, 3, 4, 5]}>
                    {() => (
                      <TableRow>
                        <TableCell>
                          <Skeleton class="h-4 w-32" />
                        </TableCell>
                        <TableCell>
                          <Skeleton class="h-4 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton class="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton class="h-4 w-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton class="h-8 w-8" />
                        </TableCell>
                      </TableRow>
                    )}
                  </For>
                }
              >
                <Show when={logsQuery.isError}>
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      class="h-24 text-center text-destructive"
                    >
                      Error loading logs. Please try again.
                    </TableCell>
                  </TableRow>
                </Show>

                <Show when={allLogs().length === 0}>
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      class="h-24 text-center text-muted-foreground"
                    >
                      No logs found.
                    </TableCell>
                  </TableRow>
                </Show>

                <Show when={logsPaddingTop() > 0}>
                  <tr aria-hidden="true">
                    <td
                      colSpan={5}
                      style={{
                        height: `${logsPaddingTop()}px`,
                        padding: "0",
                        border: "none",
                      }}
                    />
                  </tr>
                </Show>
                <For each={rowVirtualizer.getVirtualItems()}>
                  {(vRow) => {
                    const log = allLogs()[vRow.index];
                    return (
                      <TableRow class="group">
                        <TableCell class="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {formatLogTimestamp(log.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            class={cn(
                              "text-xs capitalize pl-1 pr-2 py-0.5",
                              getLevelColorClass(log.level),
                            )}
                          >
                            {getLevelIcon(log.level)}
                            {log.level}
                          </Badge>
                        </TableCell>
                        <TableCell class="text-xs font-medium text-muted-foreground capitalize">
                          {log.event_type}
                        </TableCell>
                        <TableCell class="text-sm max-w-[500px]">
                          <div class="truncate" title={log.message}>
                            {log.message}
                          </div>
                          <Show when={log.details}>
                            <div
                              class="text-xs text-muted-foreground mt-0.5 font-mono truncate opacity-70"
                              title={log.details}
                            >
                              {log.details}
                            </div>
                          </Show>
                        </TableCell>
                        <TableCell>
                          <Show when={log.details}>
                            <Button
                              variant="ghost"
                              size="icon"
                              class="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => setSelectedLog(log)}
                              title="View Details"
                            >
                              <IconEye class="h-4 w-4" />
                            </Button>
                          </Show>
                        </TableCell>
                      </TableRow>
                    );
                  }}
                </For>
                <Show when={logsPaddingBottom() > 0}>
                  <tr aria-hidden="true">
                    <td
                      colSpan={5}
                      style={{
                        height: `${logsPaddingBottom()}px`,
                        padding: "0",
                        border: "none",
                      }}
                    />
                  </tr>
                </Show>
              </Show>
            </TableBody>
          </Table>
        </div>
        <Show when={logsQuery.hasNextPage}>
          <div class="p-4 flex justify-center border-t shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logsQuery.fetchNextPage()}
              disabled={logsQuery.isFetchingNextPage}
            >
              <Show
                when={logsQuery.isFetchingNextPage}
                fallback="Load More Logs"
              >
                <IconLoader class="h-4 w-4 animate-spin" />
                Loading...
              </Show>
            </Button>
          </div>
        </Show>
      </Card>

      <Dialog
        open={!!selectedLog()}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      >
        <DialogContent class="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Log Details</DialogTitle>
            <DialogDescription>
              {selectedLog() &&
                formatLogTimestamp(selectedLog()?.created_at || "")}
            </DialogDescription>
          </DialogHeader>
          <div class="flex-1 overflow-auto space-y-4 py-4">
            <div class="space-y-1">
              <div class="text-sm font-medium text-muted-foreground">
                Message
              </div>
              <div class="p-3 rounded-md bg-muted text-sm font-mono whitespace-pre-wrap break-words">
                {selectedLog()?.message}
              </div>
            </div>
            <Show when={selectedLog()?.details}>
              <div class="space-y-1">
                <div class="text-sm font-medium text-muted-foreground">
                  Details
                </div>
                <div class="p-3 rounded-md bg-muted text-xs font-mono whitespace-pre-wrap break-words">
                  {selectedLog()?.details}
                </div>
              </div>
            </Show>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div class="flex gap-1 items-baseline">
                <span class="text-muted-foreground">Level:</span>
                <span class="capitalize font-medium">
                  {selectedLog()?.level}
                </span>
              </div>
              <div class="flex gap-1 items-baseline">
                <span class="text-muted-foreground">Source:</span>
                <span class="capitalize font-medium">
                  {selectedLog()?.event_type}
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackgroundJobCard(props: { job: BackgroundJobStatus }) {
  return (
    <div class="rounded-lg border border-border/60 bg-card p-3 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <div class="font-medium text-sm">{props.job.name}</div>
        <Badge
          variant="outline"
          class={cn(props.job.is_running && "border-info/40 text-info")}
        >
          {props.job.is_running ? "Running" : props.job.last_status ?? "Idle"}
        </Badge>
      </div>
      <div class="space-y-1 text-xs text-muted-foreground">
        <div>Runs: {props.job.run_count}</div>
        <div>
          Schedule: {props.job.schedule_mode ?? "manual"}
          <Show when={props.job.schedule_value}>
            <span>({props.job.schedule_value})</span>
          </Show>
        </div>
        <div>
          Last run: {props.job.last_run_at
            ? formatLogTimestamp(props.job.last_run_at)
            : "-"}
        </div>
        <div>
          Last success: {props.job.last_success_at
            ? formatLogTimestamp(props.job.last_success_at)
            : "-"}
        </div>
        <Show when={props.job.last_message}>
          <div class="line-clamp-2">{props.job.last_message}</div>
        </Show>
      </div>
    </div>
  );
}

function DashboardMetricCard(props: {
  label: string;
  value: number;
  highlight?: string;
}) {
  return (
    <div class="rounded-lg border border-border/60 bg-card p-3 space-y-1">
      <div class="text-xs text-muted-foreground">{props.label}</div>
      <div class={cn("text-2xl font-semibold", props.highlight)}>
        {props.value}
      </div>
    </div>
  );
}

function DownloadEventRow(props: { event: DownloadEvent }) {
  return (
    <div class="rounded-lg border border-border/60 bg-card p-3 space-y-1">
      <div class="flex items-center justify-between gap-2">
        <div class="text-sm font-medium">{props.event.event_type}</div>
        <div class="text-xs text-muted-foreground">
          {formatLogTimestamp(props.event.created_at)}
        </div>
      </div>
      <div class="text-sm text-foreground">{props.event.message}</div>
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <Show when={props.event.from_status || props.event.to_status}>
          <span>
            {props.event.from_status || "-"} -&gt;{" "}
            {props.event.to_status || "-"}
          </span>
        </Show>
        <Show when={props.event.download_id !== undefined}>
          <span>Download #{props.event.download_id}</span>
        </Show>
      </div>
    </div>
  );
}
