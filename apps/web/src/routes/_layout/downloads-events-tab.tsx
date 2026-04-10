import { Show } from "solid-js";
import { DownloadEventsFeed } from "~/components/download-events/download-events-feed";
import { DownloadEventsFilters } from "~/components/download-events/download-events-filters";
import { Button } from "~/components/ui/button";
import { TabsContent } from "~/components/ui/tabs";
import { type DownloadEventsExportResult } from "~/lib/api";
import { formatUiTimestamp } from "~/lib/date-time";
import type {
  DownloadsEventsQuery,
  DownloadsEventsSearchState,
} from "~/routes/_layout/downloads-view-types";

interface DownloadsEventsTabProps {
  downloadEventsQuery: DownloadsEventsQuery;
  eventsSearchState: DownloadsEventsSearchState;
  canGoToPreviousEventsPage: boolean;
  canGoToNextEventsPage: boolean;
  handleDownloadEventsExport: (format: "json" | "csv") => void;
  goToPreviousEventsPage: () => void;
  goToNextEventsPage: () => void;
  lastDownloadEventsExport: DownloadEventsExportResult | undefined;
}

export function DownloadsEventsTab(props: DownloadsEventsTabProps) {
  return (
    <TabsContent value="events" class="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col">
      <div class="p-4 border-b border-border/60 space-y-3">
        <DownloadEventsFilters
          eventTypeSelectId="events-event-type"
          value={props.eventsSearchState.filterValue()}
          onFieldChange={props.eventsSearchState.updateFilter}
          onApplyPreset={props.eventsSearchState.applyDateRangePreset}
          activePreset={props.eventsSearchState.activePreset()}
          onClear={props.eventsSearchState.resetFilters}
          onExport={props.handleDownloadEventsExport}
        />
      </div>
      <Show when={props.lastDownloadEventsExport?.truncated}>
        <div class="mx-4 mt-4 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          Last export was truncated: exported
          {props.lastDownloadEventsExport?.exported} of
          {props.lastDownloadEventsExport?.total} events (limit{" "}
          {props.lastDownloadEventsExport?.limit}
          ).
        </div>
      </Show>
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <DownloadEventsFeed
          events={props.downloadEventsQuery.data?.events ?? []}
          formatTimestamp={formatUiTimestamp}
          isLoading={props.downloadEventsQuery.isLoading}
          total={props.downloadEventsQuery.data?.total}
          emptyText="No download events found."
        />
      </div>
      <div class="p-4 border-t border-border/60 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={props.goToPreviousEventsPage}
          disabled={!props.canGoToPreviousEventsPage}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          onClick={props.goToNextEventsPage}
          disabled={!props.canGoToNextEventsPage}
        >
          Next
        </Button>
      </div>
    </TabsContent>
  );
}
