import { DownloadEventsFeed } from "~/features/downloads/download-events/download-events-feed";
import { DownloadEventsFilters } from "~/features/downloads/download-events/download-events-filters";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { TabsContent } from "~/components/ui/tabs";
import type {
  DownloadsEventsQuery,
  DownloadsEventsSearchState,
} from "~/features/downloads/downloads-view-types";
import { type DownloadEventsExportResult } from "~/api";
import { formatUiTimestamp } from "~/domain/date-time";

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
    <TabsContent value="events" className="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col">
      <div className="p-4 border-b border-border space-y-3">
        <DownloadEventsFilters
          eventTypeSelectId="events-event-type"
          value={props.eventsSearchState.filterValue}
          onFieldChange={props.eventsSearchState.updateFilter}
          onApplyPreset={props.eventsSearchState.applyDateRangePreset}
          activePreset={props.eventsSearchState.activePreset}
          onClear={props.eventsSearchState.resetFilters}
          onExport={props.handleDownloadEventsExport}
        />
      </div>
      {props.lastDownloadEventsExport?.truncated && (
        <Alert className="mx-4 mt-4 rounded-none bg-warning/10 border-warning/30 text-warning text-xs">
          <AlertDescription>
            Last export was truncated: exported {props.lastDownloadEventsExport?.exported} of{" "}
            {props.lastDownloadEventsExport?.total} events ({props.lastDownloadEventsExport?.limit}
            ).
          </AlertDescription>
        </Alert>
      )}
      <div className="flex-1 min-h-0 overflow-hidden p-4 space-y-3">
        <DownloadEventsFeed
          events={props.downloadEventsQuery.data?.events ?? []}
          formatTimestamp={formatUiTimestamp}
          isLoading={props.downloadEventsQuery.isLoading}
          total={props.downloadEventsQuery.data?.total}
          emptyText="No download events found."
          virtualized
          className="h-full min-h-0 overflow-auto"
        />
      </div>
      <div className="p-4 border-t border-border flex justify-end gap-2">
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
