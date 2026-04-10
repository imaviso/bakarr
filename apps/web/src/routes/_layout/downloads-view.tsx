import { IconRefresh, IconSearch } from "@tabler/icons-solidjs";
import { Show } from "solid-js";
import { DownloadEventsDialog } from "~/components/download-events-dialog";
import { PageHeader } from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { DownloadsEventsTab } from "~/routes/_layout/downloads-events-tab";
import { DownloadsHistoryTab } from "~/routes/_layout/downloads-history-tab";
import { DownloadsQueueTab } from "~/routes/_layout/downloads-queue-tab";
import type { useDownloadsRouteState } from "~/routes/_layout/downloads-route-state";

type DownloadsRouteState = ReturnType<typeof useDownloadsRouteState>;

interface DownloadsViewProps {
  searchTab: string;
  state: DownloadsRouteState;
}

export function DownloadsView(props: DownloadsViewProps) {
  return (
    <div class="flex flex-col flex-1 min-h-0 gap-4">
      <PageHeader title="Downloads" subtitle="Manage active downloads and history">
        <div class="flex items-center gap-2">
          <DownloadEventsDialog
            description="Recent queue, retry, status, and import events across all downloads."
            formatTimestamp={(value) => new Date(value).toLocaleString()}
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
              void props.state.syncDownloadsWithToast();
            }}
            disabled={props.state.syncDownloads.isPending}
          >
            <IconRefresh class="h-4 w-4" />
            Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void props.state.searchMissingWithToast();
            }}
            disabled={props.state.searchMissing.isPending}
          >
            <IconSearch class="h-4 w-4" />
            Search Missing
          </Button>
        </div>
      </PageHeader>

      <Card class="flex-1 overflow-hidden flex flex-col">
        <Tabs
          value={props.searchTab}
          onChange={(value) =>
            props.state.handleTabChange(typeof value === "string" ? value : undefined)
          }
          class="h-full flex flex-col"
        >
          <div class="px-4 pt-3 border-b">
            <TabsList class="w-full justify-start h-auto p-0 pb-px bg-transparent border-b-0 space-x-6">
              <TabsTrigger
                value="queue"
                class="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent data-[selected]:bg-transparent"
              >
                Queue
                <Show when={props.state.queueCount() > 0}>
                  <Badge variant="secondary" class="ml-2 h-5 px-1.5 min-w-[1.25rem] text-xs">
                    {props.state.queueCount()}
                  </Badge>
                </Show>
              </TabsTrigger>
              <TabsTrigger
                value="history"
                class="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent data-[selected]:bg-transparent"
              >
                History
              </TabsTrigger>
              <TabsTrigger
                value="events"
                class="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent data-[selected]:bg-transparent"
              >
                Events
              </TabsTrigger>
            </TabsList>
          </div>

          <DownloadsQueueTab queue={props.state.queue} />

          <DownloadsEventsTab
            downloadEventsQuery={props.state.downloadEventsQuery}
            eventsSearchState={props.state.eventsSearchState}
            canGoToPreviousEventsPage={props.state.canGoToPreviousEventsPage()}
            canGoToNextEventsPage={props.state.canGoToNextEventsPage()}
            handleDownloadEventsExport={props.state.handleDownloadEventsExport}
            goToPreviousEventsPage={props.state.goToPreviousEventsPage}
            goToNextEventsPage={props.state.goToNextEventsPage}
            lastDownloadEventsExport={props.state.lastDownloadEventsExport()}
          />

          <DownloadsHistoryTab
            history={props.state.history}
            historyQuery={props.state.historyQuery}
          />
        </Tabs>
      </Card>
    </div>
  );
}
