import { useState } from "react";
import { WarningIcon, EyeIcon, TableIcon, BracketsCurlyIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DownloadEventDetailsDialog } from "@/features/downloads/download-event-details-dialog";
import { useDownloadEventsQuery } from "@/api/system-download-events";
import type {
  DownloadEvent,
  DownloadEventsExportInput,
  DownloadEventsFilterInput,
} from "@/api/contracts";
import { useDownloadEventsExport } from "@/features/downloads/use-download-events-export";
import { DownloadEventsFeed } from "@/features/downloads/download-events/download-events-feed";

interface DownloadEventsDialogProps {
  mediaId?: number | undefined;
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
  const [selectedEvent, setSelectedEvent] = useState<DownloadEvent | null>(null);
  const queryInput: DownloadEventsFilterInput = {
    direction: pagination.direction,
    limit: props.limit ?? 25,
    ...(props.mediaId === undefined ? {} : { mediaId: props.mediaId }),
    ...(pagination.cursor === undefined ? {} : { cursor: pagination.cursor }),
    ...(props.downloadId === undefined ? {} : { downloadId: props.downloadId }),
    ...(props.eventType === undefined ? {} : { eventType: props.eventType }),
  };
  const query = useDownloadEventsQuery(queryInput, { enabled: open });
  const { exportDownloadEvents, lastExport } = useDownloadEventsExport();
  const exportBaseInput: DownloadEventsExportInput = {
    ...(props.mediaId === undefined ? {} : { mediaId: props.mediaId }),
    ...(props.downloadId === undefined ? {} : { downloadId: props.downloadId }),
    ...(props.eventType === undefined ? {} : { eventType: props.eventType }),
    limit: props.exportLimit ?? 10_000,
    order: "desc" as const,
  };
  const openExport = (format: "json" | "csv") => {
    exportDownloadEvents(format, exportBaseInput);
  };

  const events = query.data?.events ?? [];

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setPagination({ direction: "next" });
    } else {
      setSelectedEvent(null);
    }
    setOpen(nextOpen);
  };

  const handleSelectEvent = (event: DownloadEvent) => {
    setSelectedEvent(event);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant={props.triggerVariant ?? "ghost"}
        size={props.triggerSize ?? "icon"}
        {...(props.showTriggerLabel
          ? {}
          : { className: "relative after:absolute after:-inset-2 h-7 w-7" })}
        aria-label={props.triggerLabel ?? "View download events"}
        onPress={() => handleOpenChange(true)}
      >
        <EyeIcon className="h-4 w-4" />
        {props.showTriggerLabel && <span>{props.triggerLabel ?? "View events"}</span>}
      </Button>

      <Dialog
        isOpen={open}
        onOpenChange={handleOpenChange}
        className="w-[min(calc(100vw-2rem),72rem)] max-w-none sm:max-w-none max-h-[80vh] flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>
            {props.description ?? "Recent download lifecycle events for this item."}
          </DialogDescription>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onPress={() => openExport("json")}>
              <BracketsCurlyIcon className="h-4 w-4" />
              Export JSON
            </Button>
            <Button variant="outline" size="sm" onPress={() => openExport("csv")}>
              <TableIcon className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
          {lastExport?.truncated && (
            <Alert className="text-xs">
              <WarningIcon className="h-4 w-4 shrink-0" />
              <AlertDescription>
                Last export was truncated: exported {lastExport?.exported} of {lastExport?.total}{" "}
                events (limit {lastExport?.limit}).
              </AlertDescription>
            </Alert>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
          <DownloadEventsFeed
            events={events}
            formatTimestamp={props.formatTimestamp}
            isLoading={query.isLoading}
            total={query.data?.total}
            emptyText="No download events found for this selection."
            onSelectEvent={handleSelectEvent}
            className="space-y-3"
          />
          {events.length > 0 && (
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                isDisabled={!query.data?.prev_cursor}
                onPress={() => {
                  setPagination({ cursor: query.data?.prev_cursor, direction: "prev" });
                }}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                isDisabled={!query.data?.next_cursor}
                onPress={() => {
                  setPagination({ cursor: query.data?.next_cursor, direction: "next" });
                }}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </Dialog>

      <DownloadEventDetailsDialog
        event={selectedEvent}
        formatTimestamp={props.formatTimestamp}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedEvent(null);
          }
        }}
      />
    </>
  );
}
