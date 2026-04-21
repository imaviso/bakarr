import { useState } from "react";
import { WarningIcon, EyeIcon, TableIcon, BracketsCurlyIcon } from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { DownloadEventDetailsDialog } from "~/components/download-event-details-dialog";
import {
  createDownloadEventsQuery,
  type DownloadEvent,
  type DownloadEventsFilterInput,
  type DownloadEventsExportResult,
} from "~/lib/api";
import { runDownloadEventsExport } from "~/lib/download-events-export";
import { DownloadEventsFeed } from "~/components/download-events/download-events-feed";

interface DownloadEventsDialogProps {
  animeId?: number | undefined;
  downloadId?: number | undefined;
  eventType?: string | undefined;
  formatTimestamp: (value: string) => string;
  limit?: number | undefined;
  title: string;
  triggerLabel?: string | undefined;
  description?: string | undefined;
  triggerVariant?: "ghost" | "outline" | "default" | undefined;
  triggerSize?: "icon" | "sm" | "default" | undefined;
  showTriggerLabel?: boolean | undefined;
  exportLimit?: number | undefined;
}

interface Pagination {
  cursor?: string | undefined;
  direction: "next" | "prev";
}

export function DownloadEventsDialog(props: DownloadEventsDialogProps) {
  const [open, setOpen] = useState(false);
  const [pagination, setPagination] = useState<Pagination>({ direction: "next" });
  const [lastExportResult, setLastExportResult] = useState<DownloadEventsExportResult | undefined>(
    undefined,
  );
  const [selectedEvent, setSelectedEvent] = useState<DownloadEvent | null>(null);
  const queryInput: DownloadEventsFilterInput = {
    direction: pagination.direction,
    limit: props.limit ?? 25,
    ...(props.animeId === undefined ? {} : { animeId: props.animeId }),
    ...(pagination.cursor === undefined ? {} : { cursor: pagination.cursor }),
    ...(props.downloadId === undefined ? {} : { downloadId: props.downloadId }),
    ...(props.eventType === undefined ? {} : { eventType: props.eventType }),
  };
  const query = createDownloadEventsQuery(queryInput, { enabled: open });
  const exportBaseInput = {
    ...(props.animeId === undefined ? {} : { animeId: props.animeId }),
    ...(props.downloadId === undefined ? {} : { downloadId: props.downloadId }),
    ...(props.eventType === undefined ? {} : { eventType: props.eventType }),
    limit: props.exportLimit ?? 10_000,
    order: "desc" as const,
  };
  const openExport = (format: "json" | "csv") => {
    void runDownloadEventsExport({
      format,
      input: exportBaseInput,
      onComplete: (result) => {
        setLastExportResult(result);
      },
    });
  };

  const events = query.data?.events ?? [];

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setPagination({ direction: "next" });
      setLastExportResult(undefined);
    }
    setOpen(nextOpen);
  };

  return (
    <>
      <Button
        variant={props.triggerVariant ?? "ghost"}
        size={props.triggerSize ?? "icon"}
        className={
          props.showTriggerLabel ? undefined : "relative after:absolute after:-inset-2 h-7 w-7"
        }
        aria-label={props.triggerLabel ?? "View download events"}
        onClick={() => handleOpenChange(true)}
      >
        <EyeIcon className="h-4 w-4" />
        {props.showTriggerLabel && <span>{props.triggerLabel ?? "View events"}</span>}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogDescription>
              {props.description ?? "Recent download lifecycle events for this item."}
            </DialogDescription>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => openExport("json")}>
                <BracketsCurlyIcon className="h-4 w-4" />
                Export JSON
              </Button>
              <Button variant="outline" size="sm" onClick={() => openExport("csv")}>
                <TableIcon className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
            {lastExportResult?.truncated && (
              <div className="flex items-start gap-2 rounded-none border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                <WarningIcon className="h-4 w-4 shrink-0" />
                <span>
                  Last export was truncated: exported {lastExportResult?.exported} of{" "}
                  {lastExportResult?.total} events (limit {lastExportResult?.limit}).
                </span>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
            <DownloadEventsFeed
              events={events}
              formatTimestamp={props.formatTimestamp}
              isLoading={query.isLoading}
              total={query.data?.total}
              emptyText="No download events found for this selection."
              onSelectEvent={setSelectedEvent}
              className="space-y-3"
            />
            {events.length > 0 && (
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!query.data?.prev_cursor}
                  onClick={() => {
                    setPagination({ cursor: query.data?.prev_cursor, direction: "prev" });
                  }}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!query.data?.next_cursor}
                  onClick={() => {
                    setPagination({ cursor: query.data?.next_cursor, direction: "next" });
                  }}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DownloadEventDetailsDialog
        event={selectedEvent}
        formatTimestamp={props.formatTimestamp}
        onOpenChange={(nextOpen) => !nextOpen && setSelectedEvent(null)}
      />
    </>
  );
}
