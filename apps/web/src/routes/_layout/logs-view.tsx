import {
  IconDownload,
  IconFileSpreadsheet,
  IconJson,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-solidjs";
import { For, Show } from "solid-js";
import { BackgroundJobCard } from "~/components/logs/background-job-card";
import { DashboardMetricCard } from "~/components/logs/dashboard-metric-card";
import { DownloadEventsList } from "~/components/logs/download-events-list";
import { LogDetailsDialog } from "~/components/logs/log-details-dialog";
import { SystemLogsTable } from "~/components/logs/system-logs-table";
import { DownloadEventsFilters } from "~/components/download-events/download-events-filters";
import { Filter } from "~/components/filters";
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
import { cn } from "~/lib/utils";
import { formatLogTimestamp, type useLogsRouteState } from "~/routes/_layout/logs-route-state";
import { logsFilterColumns } from "~/routes/_layout/logs-filter-config";

type LogsRouteState = ReturnType<typeof useLogsRouteState>;

interface LogsViewProps {
  state: LogsRouteState;
}

export function LogsView(props: LogsViewProps) {
  return (
    <div class="flex flex-col flex-1 min-h-0 gap-6">
      <PageHeader title="System Logs" subtitle="View, filter, and export system events and errors">
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-2">
            <Switch
              checked={props.state.autoRefresh()}
              onChange={props.state.setAutoRefresh}
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
            onClick={props.state.refreshAll}
            disabled={props.state.logsQuery.isRefetching}
          >
            <IconRefresh
              class={cn("h-4 w-4", props.state.logsQuery.isRefetching && "animate-spin")}
            />
            Refresh
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger as={Button} variant="outline" size="sm">
              <IconDownload class="h-4 w-4" />
              Export
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => props.state.exportLogs("json")}>
                <IconJson class="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.state.exportLogs("csv")}>
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
                  onClick={props.state.clearLogsWithToast}
                >
                  Clear Logs
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PageHeader>

      <Filter.Provider
        columns={logsFilterColumns}
        value={props.state.filterStates}
        onChange={props.state.setFilterStates}
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
          <p class="text-xs text-muted-foreground mt-1">High-level download and worker health</p>
        </div>
        <div class="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Show
            when={props.state.dashboardQuery.data}
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
            when={!props.state.jobsQuery.isLoading}
            fallback={<For each={[1, 2, 3, 4]}>{() => <Skeleton class="h-24 w-full" />}</For>}
          >
            <Show
              when={(props.state.jobsQuery.data?.length ?? 0) > 0}
              fallback={<div class="text-sm text-muted-foreground">No background job data yet</div>}
            >
              <For each={props.state.jobsQuery.data}>
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
              value={props.state.downloadEventsSearchState.filterValue()}
              onFieldChange={props.state.downloadEventsSearchState.updateFilter}
              onApplyPreset={props.state.downloadEventsSearchState.applyDateRangePreset}
              activePreset={props.state.downloadEventsSearchState.activePreset()}
              onClear={props.state.downloadEventsSearchState.resetFilters}
              clearLabel="Reset"
              onExport={props.state.exportDownloadEvents}
              showPagination
              onPrevious={props.state.goToPreviousDownloadEventsPage}
              previousDisabled={!props.state.canGoToPreviousDownloadEventsPage()}
              onNext={props.state.goToNextDownloadEventsPage}
              nextDisabled={!props.state.canGoToNextDownloadEventsPage()}
            />
            <Show when={props.state.lastDownloadEventsExport()?.truncated}>
              <div class="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                Last export was truncated: exported
                {props.state.lastDownloadEventsExport()?.exported} of
                {props.state.lastDownloadEventsExport()?.total} events (limit{" "}
                {props.state.lastDownloadEventsExport()?.limit}).
              </div>
            </Show>
          </div>
        </div>
        <Show
          when={props.state.downloadEventsQuery.data?.events.length}
          fallback={<div class="p-4 text-sm text-muted-foreground">No recent download events</div>}
        >
          <div class="px-4 pt-3 pb-1 text-xs text-muted-foreground">
            Showing {props.state.downloadEventsQuery.data?.events.length ?? 0} of{" "}
            {props.state.downloadEventsQuery.data?.total ?? 0} events
          </div>
          <DownloadEventsList
            events={props.state.downloadEventsQuery.data?.events ?? []}
            formatTimestamp={formatLogTimestamp}
            onSelectEvent={props.state.setSelectedDownloadEvent}
            hideCount
          />
        </Show>
      </Card>

      <Card class="border-primary/20 flex-1 min-h-0 flex flex-col overflow-hidden">
        <SystemLogsTable
          logs={props.state.allLogs()}
          isLoading={props.state.logsQuery.isLoading}
          isError={props.state.logsQuery.isError}
          hasNextPage={props.state.logsQuery.hasNextPage}
          isFetchingNextPage={props.state.logsQuery.isFetchingNextPage}
          formatTimestamp={formatLogTimestamp}
          onFetchNextPage={() => {
            void props.state.logsQuery.fetchNextPage();
          }}
          onSelectLog={props.state.setSelectedLog}
        />
      </Card>

      <LogDetailsDialog
        log={props.state.selectedLog()}
        formatTimestamp={formatLogTimestamp}
        onOpenChange={(open) => {
          if (!open) {
            props.state.setSelectedLog(null);
          }
        }}
      />

      <DownloadEventDetailsDialog
        event={props.state.selectedDownloadEvent()}
        formatTimestamp={formatLogTimestamp}
        onOpenChange={(open) => !open && props.state.setSelectedDownloadEvent(null)}
      />
    </div>
  );
}
