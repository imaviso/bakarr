import { ArrowClockwiseIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { DownloadEventsDialog } from "~/features/downloads/download-events-dialog";
import { PageHeader } from "~/app/layout/page-header";
import { PageShell } from "~/app/layout/page-shell";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { DownloadsEventsTab } from "~/features/downloads/downloads-events-tab";
import { DownloadsHistoryTab } from "~/features/downloads/downloads-history-tab";
import { DownloadsQueueTab } from "~/features/downloads/downloads-queue-tab";
import type { DownloadsViewState } from "~/features/downloads/downloads-view-types";
import { formatUiTimestamp } from "~/domain/date-time";

interface DownloadsViewProps {
  searchTab: string;
  state: DownloadsViewState;
}

export function DownloadsView(props: DownloadsViewProps) {
  return (
    <PageShell scroll="inner">
      <PageHeader title="Downloads" subtitle="Manage active downloads and history">
        <div className="flex items-center gap-2">
          <DownloadEventsDialog
            description="Recent queue, retry, status, and import events across all downloads."
            formatTimestamp={formatUiTimestamp}
            limit={50}
            showTriggerLabel
            title="Download Event Feed"
            triggerLabel="Browse Events"
            triggerSize="sm"
            triggerVariant="outline"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              props.state.triggerSyncDownloads();
            }}
            disabled={props.state.syncDownloads.isPending}
          >
            <ArrowClockwiseIcon className="h-4 w-4" />
            Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              props.state.triggerSearchMissing();
            }}
            disabled={props.state.searchMissing.isPending}
          >
            <MagnifyingGlassIcon className="h-4 w-4" />
            Search Missing
          </Button>
        </div>
      </PageHeader>

      <Tabs
        value={props.searchTab}
        onChange={(value) =>
          props.state.handleTabChange(typeof value === "string" ? value : undefined)
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList variant="line" className="w-full justify-start gap-6">
          <TabsTrigger value="queue">
            Queue
            {props.state.queueCount > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 min-w-[1.25rem] px-1.5">
                {props.state.queueCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <DownloadsQueueTab queue={props.state.queue} />

        <DownloadsEventsTab
          downloadEventsQuery={props.state.downloadEventsQuery}
          eventsSearchState={props.state.eventsSearchState}
          canGoToPreviousEventsPage={props.state.canGoToPreviousEventsPage}
          canGoToNextEventsPage={props.state.canGoToNextEventsPage}
          handleDownloadEventsExport={props.state.handleDownloadEventsExport}
          goToPreviousEventsPage={props.state.goToPreviousEventsPage}
          goToNextEventsPage={props.state.goToNextEventsPage}
          lastDownloadEventsExport={props.state.lastDownloadEventsExport}
        />

        <DownloadsHistoryTab history={props.state.history} />
      </Tabs>
    </PageShell>
  );
}
