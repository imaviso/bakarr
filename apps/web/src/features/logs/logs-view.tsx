import {
  DownloadIcon,
  TableIcon,
  BracketsCurlyIcon,
  ArrowClockwiseIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { BackgroundJobCard } from "~/components/logs/background-job-card";
import { DashboardMetricCard } from "~/components/logs/dashboard-metric-card";
import { DownloadEventsList } from "~/components/logs/download-events-list";
import { LogDetailsDialog } from "~/components/logs/log-details-dialog";
import { SystemLogsTable } from "~/components/logs/system-logs-table";
import { DownloadEventsFilters } from "~/components/download-events/download-events-filters";
import { Filter } from "~/components/filters";
import { PageHeader } from "~/components/page-header";
import { DownloadEventDetailsDialog } from "~/components/download-event-details-dialog";
import { logsFilterColumns } from "~/features/logs/logs-filter-config";
import { formatLogTimestamp, type useLogsRouteState } from "~/features/logs/logs-route-state";
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

type LogsRouteState = ReturnType<typeof useLogsRouteState>;

interface LogsViewProps {
  state: LogsRouteState;
}

export function LogsView(props: LogsViewProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      <PageHeader title="System Logs" subtitle="View, filter, and export system events and errors">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={props.state.autoRefresh}
              onCheckedChange={props.state.setAutoRefresh}
              id="auto-refresh"
            />
            <label
              htmlFor="auto-refresh"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
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
            <ArrowClockwiseIcon
              className={cn("h-4 w-4", props.state.logsQuery.isRefetching && "animate-spin")}
            />
            Refresh
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <DownloadIcon className="h-4 w-4" />
              Export
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => props.state.exportLogs("json")}>
                <BracketsCurlyIcon className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.state.exportLogs("csv")}>
                <TableIcon className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
              <TrashIcon className="h-4 w-4" />
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
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
          <div className="flex flex-wrap items-center gap-2">
            <Filter.Menu />
            <Filter.List />
            <Filter.Actions />
          </div>
        </Filter.Root>
      </Filter.Provider>

      <Card className="border-dashed">
        <div className="p-4 border-b border-border/60">
          <h2 className="text-sm font-medium text-foreground">Ops Summary</h2>
          <p className="text-xs text-muted-foreground mt-1">High-level download and worker health</p>
        </div>
        <div className="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {props.state.dashboardQuery.data ? (
            <>
              <DashboardMetricCard label="Queued" value={props.state.dashboardQuery.data.queued_downloads} />
              <DashboardMetricCard label="Active" value={props.state.dashboardQuery.data.active_downloads} />
              <DashboardMetricCard
                label="Failed"
                value={props.state.dashboardQuery.data.failed_downloads}
                highlight="text-error"
              />
              <DashboardMetricCard
                label="Imported"
                value={props.state.dashboardQuery.data.imported_downloads}
                highlight="text-success"
              />
              <DashboardMetricCard
                label="Running Jobs"
                value={props.state.dashboardQuery.data.running_jobs}
                highlight="text-info"
              />
            </>
          ) : (
            Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={`ops-metric-skeleton-${index}`} className="h-20 w-full" />
            ))
          )}
        </div>
      </Card>

      <Card className="border-dashed">
        <div className="p-4 border-b border-border/60">
          <h2 className="text-sm font-medium text-foreground">Background Jobs</h2>
          <p className="text-xs text-muted-foreground mt-1">Current scheduler and worker visibility</p>
        </div>
        <div className="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {!props.state.jobsQuery.isLoading ? (
            (props.state.jobsQuery.data?.length ?? 0) > 0 ? (
              props.state.jobsQuery.data?.map((job) => (
                <BackgroundJobCard key={job.name} job={job} formatTimestamp={formatLogTimestamp} />
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No background job data yet</div>
            )
          ) : (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`jobs-skeleton-${index}`} className="h-24 w-full" />
            ))
          )}
        </div>
      </Card>

      <Card className="border-dashed">
        <div className="p-4 border-b border-border/60">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-medium text-foreground">Recent Download Events</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Latest queued, retried, reconciled, and imported download actions
              </p>
            </div>
            <DownloadEventsFilters
              eventTypeSelectId="download-event-type"
              value={props.state.downloadEventsSearchState.filterValue}
              onFieldChange={props.state.downloadEventsSearchState.updateFilter}
              onApplyPreset={props.state.downloadEventsSearchState.applyDateRangePreset}
              activePreset={props.state.downloadEventsSearchState.activePreset}
              onClear={props.state.downloadEventsSearchState.resetFilters}
              clearLabel="Reset"
              onExport={props.state.exportDownloadEvents}
              showPagination
              onPrevious={props.state.goToPreviousDownloadEventsPage}
              previousDisabled={!props.state.canGoToPreviousDownloadEventsPage}
              onNext={props.state.goToNextDownloadEventsPage}
              nextDisabled={!props.state.canGoToNextDownloadEventsPage}
            />
            {props.state.lastDownloadEventsExport?.truncated && (
              <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                Last export was truncated: exported
                {props.state.lastDownloadEventsExport?.exported} of
                {props.state.lastDownloadEventsExport?.total} events (limit{" "}
                {props.state.lastDownloadEventsExport?.limit}).
              </div>
            )}
          </div>
        </div>
        {props.state.downloadEventsQuery.data?.events.length ? (
          <>
            <div className="px-4 pt-3 pb-1 text-xs text-muted-foreground">
              Showing {props.state.downloadEventsQuery.data.events.length} of{" "}
              {props.state.downloadEventsQuery.data.total ?? 0} events
            </div>
            <DownloadEventsList
              events={props.state.downloadEventsQuery.data.events}
              formatTimestamp={formatLogTimestamp}
              onSelectEvent={props.state.setSelectedDownloadEvent}
              hideCount
            />
          </>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">No recent download events</div>
        )}
      </Card>

      <Card className="border-primary/20 flex-1 min-h-0 flex flex-col overflow-hidden">
        <SystemLogsTable
          logs={props.state.allLogs}
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
        log={props.state.selectedLog}
        formatTimestamp={formatLogTimestamp}
        onOpenChange={(open) => {
          if (!open) {
            props.state.setSelectedLog(null);
          }
        }}
      />

      <DownloadEventDetailsDialog
        event={props.state.selectedDownloadEvent}
        formatTimestamp={formatLogTimestamp}
        onOpenChange={(open) => !open && props.state.setSelectedDownloadEvent(null)}
      />
    </div>
  );
}
