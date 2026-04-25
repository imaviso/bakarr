import { ArrowClockwiseIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { DownloadEventsDialog } from "~/features/downloads/download-events-dialog";
import { PageHeader } from "~/app/layout/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-2">
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

      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <Tabs
          value={props.searchTab}
          onChange={(value) =>
            props.state.handleTabChange(typeof value === "string" ? value : undefined)
          }
          className="h-full min-h-0 flex flex-col"
        >
          <div className="px-4 pt-3 border-b">
            <TabsList className="w-full justify-start h-auto p-0 pb-px bg-transparent border-b-0 space-x-6">
              <TabsTrigger
                value="queue"
                className="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent data-[selected]:bg-transparent"
              >
                Queue
                {props.state.queueCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 min-w-[1.25rem] text-xs">
                    {props.state.queueCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent data-[selected]:bg-transparent"
              >
                History
              </TabsTrigger>
              <TabsTrigger
                value="events"
                className="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent data-[selected]:bg-transparent"
              >
                Events
              </TabsTrigger>
            </TabsList>
          </div>

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
      </Card>
    </div>
  );
}
