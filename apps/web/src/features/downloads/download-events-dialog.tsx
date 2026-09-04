import { useState } from "react";
import { RiBracketsLine, RiErrorWarningLine, RiEyeLine, RiTableLine } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ContentDialog,
  ContentDialogBody,
  ContentDialogFooter,
  ContentDialogHeader,
} from "@/components/shared/content-dialog";
import { IconButton } from "@/components/shared/icon-button";
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
  cursor?: string | null | undefined;
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
      {props.showTriggerLabel ? (
        <Button
          variant={props.triggerVariant ?? "ghost"}
          size={props.triggerSize ?? "icon"}
          aria-label={props.triggerLabel ?? "View download events"}
          onPress={() => handleOpenChange(true)}
        >
          <RiEyeLine className="h-4 w-4" />
          <span>{props.triggerLabel ?? "View events"}</span>
        </Button>
      ) : (
        <IconButton
          variant={props.triggerVariant ?? "ghost"}
          aria-label={props.triggerLabel ?? "View download events"}
          onPress={() => handleOpenChange(true)}
        >
          <RiEyeLine className="h-4 w-4" />
        </IconButton>
      )}

      <ContentDialog size="xl" isOpen={open} onOpenChange={handleOpenChange}>
        <ContentDialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>
            {props.description ?? "Recent download lifecycle events for this item."}
          </DialogDescription>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onPress={() => openExport("json")}>
              <RiBracketsLine className="h-4 w-4" />
              Export JSON
            </Button>
            <Button variant="outline" size="sm" onPress={() => openExport("csv")}>
              <RiTableLine className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
          {lastExport?.truncated && (
            <Alert className="text-xs">
              <RiErrorWarningLine className="h-4 w-4 shrink-0" />
              <AlertDescription>
                Last export was truncated: exported {lastExport?.exported} of {lastExport?.total}{" "}
                events (limit {lastExport?.limit}).
              </AlertDescription>
            </Alert>
          )}
        </ContentDialogHeader>

        <ContentDialogBody className="space-y-3 px-4 py-2">
          <DownloadEventsFeed
            events={events}
            formatTimestamp={props.formatTimestamp}
            isLoading={query.isLoading}
            total={query.data?.total}
            emptyText="No download events found for this selection."
            onSelectEvent={handleSelectEvent}
            className="space-y-3"
          />
        </ContentDialogBody>

        {events.length > 0 && (
          <ContentDialogFooter className="gap-2">
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
          </ContentDialogFooter>
        )}
      </ContentDialog>

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
