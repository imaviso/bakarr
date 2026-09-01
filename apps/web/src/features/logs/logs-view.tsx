import {
  RiBracketsLine,
  RiDeleteBinLine,
  RiDownloadLine,
  RiRefreshLine,
  RiTableLine,
} from "@remixicon/react";
import { EmptyState } from "@/components/shared/empty-state";
import { BackgroundJobCard } from "@/features/logs/background-job-card";
import { DashboardMetricCard } from "@/features/logs/dashboard-metric-card";
import { DownloadEventsList } from "@/features/logs/download-events-list";
import { LogDetailsDialog } from "@/features/logs/log-details-dialog";
import { SystemLogsTable } from "@/features/logs/system-logs-table";
import { DownloadEventsFilters } from "@/features/downloads/download-events/download-events-filters";
import { Filter } from "@/features/filters";
import { PageHeader } from "@/app/layout/page-header";
import { PageShell } from "@/app/layout/page-shell";
import { DownloadEventDetailsDialog } from "@/features/downloads/download-event-details-dialog";
import { logsFilterColumns } from "@/features/logs/logs-filter-config";
import { formatUiTimestamp } from "@/domain/date-time";
import { type useLogsRouteState } from "@/features/logs/logs-route-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/infra/utils";

type LogsRouteState = ReturnType<typeof useLogsRouteState>;

interface LogsViewProps {
  state: LogsRouteState;
}

export function LogsView(props: LogsViewProps) {
  return (
    <PageShell scroll="inner">
      <PageHeader title="System Logs" subtitle="View, filter, and export system events and errors">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Switch
              isSelected={props.state.autoRefresh}
              onChange={props.state.setAutoRefresh}
              id="auto-refresh"
            />
            <Label htmlFor="auto-refresh">Auto-Refresh</Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onPress={props.state.refreshAll}
            isDisabled={props.state.logsQuery.isRefetching}
          >
            <RiRefreshLine
              className={cn("h-4 w-4", props.state.logsQuery.isRefetching && "animate-spin")}
            />
            Refresh
          </Button>

          <DropdownMenuTrigger>
            <Button variant="outline" size="sm">
              <RiDownloadLine className="h-4 w-4" />
              Export
            </Button>
            <DropdownMenu>
              <DropdownMenuItem onAction={() => props.state.exportLogs("json")}>
                <RiBracketsLine className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onAction={() => props.state.exportLogs("csv")}>
                <RiTableLine className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenu>
          </DropdownMenuTrigger>

          <ConfirmDialog
            trigger={
              <Button variant="destructive" size="sm">
                <RiDeleteBinLine className="h-4 w-4" />
                Clear Logs
              </Button>
            }
            title="Clear All Logs?"
            description="This action cannot be undone. This will permanently delete all system logs from the database."
            confirmLabel="Clear Logs"
            destructive
            onConfirm={() => props.state.clearLogs.mutate()}
          />
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-6">
        <div>
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
        </div>

        <Card>
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-medium text-foreground">Ops Summary</h2>
            <p className="text-xs text-muted-foreground mt-1">
              High-level download and worker health
            </p>
          </div>
          <div className="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {props.state.dashboardQuery.data ? (
              <>
                <DashboardMetricCard
                  label="Queued"
                  value={props.state.dashboardQuery.data.queued_downloads}
                />
                <DashboardMetricCard
                  label="Active"
                  value={props.state.dashboardQuery.data.active_downloads}
                />
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
              <>
                <Skeleton key="ops-metric-skeleton-0" className="h-20 w-full" />
                <Skeleton key="ops-metric-skeleton-1" className="h-20 w-full" />
                <Skeleton key="ops-metric-skeleton-2" className="h-20 w-full" />
                <Skeleton key="ops-metric-skeleton-3" className="h-20 w-full" />
                <Skeleton key="ops-metric-skeleton-4" className="h-20 w-full" />
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-medium text-foreground">Background Jobs</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Current scheduler and worker visibility
            </p>
          </div>
          <div className="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {!props.state.jobsQuery.isLoading ? (
              (props.state.jobsQuery.data?.length ?? 0) > 0 ? (
                props.state.jobsQuery.data?.map((job) => (
                  <BackgroundJobCard key={job.name} job={job} formatTimestamp={formatUiTimestamp} />
                ))
              ) : (
                <EmptyState compact title="No background job data yet" />
              )
            ) : (
              <>
                <Skeleton key="jobs-skeleton-0" className="h-24 w-full" />
                <Skeleton key="jobs-skeleton-1" className="h-24 w-full" />
                <Skeleton key="jobs-skeleton-2" className="h-24 w-full" />
                <Skeleton key="jobs-skeleton-3" className="h-24 w-full" />
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-4 border-b border-border">
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
                <div className="rounded-none border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
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
                formatTimestamp={formatUiTimestamp}
                onSelectEvent={props.state.setSelectedDownloadEvent}
                hideCount
              />
            </>
          ) : (
            <EmptyState compact title="No recent download events" />
          )}
        </Card>

        <Card className="border-primary/20 h-[clamp(20rem,45vh,34rem)] flex flex-col overflow-hidden">
          <SystemLogsTable
            logs={props.state.allLogs}
            isLoading={props.state.logsQuery.isLoading}
            isError={props.state.logsQuery.isError}
            hasNextPage={props.state.logsQuery.hasNextPage}
            isFetchingNextPage={props.state.logsQuery.isFetchingNextPage}
            formatTimestamp={formatUiTimestamp}
            onFetchNextPage={props.state.logsQuery.fetchNextPage}
            onSelectLog={props.state.setSelectedLog}
          />
        </Card>
      </div>

      <LogDetailsDialog
        log={props.state.selectedLog}
        formatTimestamp={formatUiTimestamp}
        onOpenChange={(open) => {
          if (!open) {
            props.state.setSelectedLog(null);
          }
        }}
      />

      <DownloadEventDetailsDialog
        event={props.state.selectedDownloadEvent}
        formatTimestamp={formatUiTimestamp}
        onOpenChange={(open) => !open && props.state.setSelectedDownloadEvent(null)}
      />
    </PageShell>
  );
}
