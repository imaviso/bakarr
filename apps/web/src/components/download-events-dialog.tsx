import { createMemo, createSignal, For, Show } from "solid-js";
import {
  IconAlertTriangle,
  IconEye,
  IconFileSpreadsheet,
  IconJson,
  IconLoader,
} from "@tabler/icons-solidjs";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { DownloadEventCard } from "~/components/download-event-card";
import { DownloadEventDetailsDialog } from "~/components/download-event-details-dialog";
import {
  createDownloadEventsQuery,
  type DownloadEvent,
  type DownloadEventsFilterInput,
  type DownloadEventsExportResult,
} from "~/lib/api";
import { runDownloadEventsExport } from "~/lib/download-events-export";

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

export function DownloadEventsDialog(props: DownloadEventsDialogProps) {
  const [open, setOpen] = createSignal(false);
  const [cursor, setCursor] = createSignal<string | undefined>(undefined);
  const [direction, setDirection] = createSignal<"next" | "prev">("next");
  const [lastExportResult, setLastExportResult] = createSignal<
    DownloadEventsExportResult | undefined
  >(undefined);
  const [selectedEvent, setSelectedEvent] = createSignal<DownloadEvent | null>(null);
  const query = createDownloadEventsQuery(() => {
    const input: DownloadEventsFilterInput = {
      direction: direction(),
      limit: props.limit ?? 25,
    };

    if (props.animeId !== undefined) {
      input.animeId = props.animeId;
    }
    const currentCursor = cursor();
    if (currentCursor !== undefined) {
      input.cursor = currentCursor;
    }
    if (props.downloadId !== undefined) {
      input.downloadId = props.downloadId;
    }
    if (props.eventType !== undefined) {
      input.eventType = props.eventType;
    }

    return input;
  });
  const exportBaseInput = createMemo(() => {
    return {
      ...(props.animeId === undefined ? {} : { animeId: props.animeId }),
      ...(props.downloadId === undefined ? {} : { downloadId: props.downloadId }),
      ...(props.eventType === undefined ? {} : { eventType: props.eventType }),
      limit: props.exportLimit ?? 10_000,
      order: "desc" as const,
    };
  });
  const openExport = (format: "json" | "csv") => {
    void runDownloadEventsExport({
      format,
      input: exportBaseInput(),
      onComplete: (result) => {
        setLastExportResult(result);
      },
    });
  };

  const events = createMemo(() => query.data?.events ?? []);

  return (
    <>
      <Button
        variant={props.triggerVariant ?? "ghost"}
        size={props.triggerSize ?? "icon"}
        class={
          props.showTriggerLabel ? undefined : "relative after:absolute after:-inset-2 h-7 w-7"
        }
        aria-label={props.triggerLabel ?? "View download events"}
        onClick={() => {
          setCursor(undefined);
          setDirection("next");
          setOpen(true);
          void query.refetch();
        }}
      >
        <IconEye class="h-4 w-4" />
        <Show when={props.showTriggerLabel}>
          <span>{props.triggerLabel ?? "View events"}</span>
        </Show>
      </Button>

      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent class="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogDescription>
              {props.description ?? "Recent download lifecycle events for this item."}
            </DialogDescription>
            <div class="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => openExport("json")}>
                <IconJson class="h-4 w-4" />
                Export JSON
              </Button>
              <Button variant="outline" size="sm" onClick={() => openExport("csv")}>
                <IconFileSpreadsheet class="h-4 w-4" />
                Export CSV
              </Button>
            </div>
            <Show when={lastExportResult()?.truncated}>
              <div class="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                <IconAlertTriangle class="h-4 w-4 shrink-0" />
                <span>
                  Last export was truncated: exported {lastExportResult()?.exported} of{" "}
                  {lastExportResult()?.total} events (limit {lastExportResult()?.limit}).
                </span>
              </div>
            </Show>
          </DialogHeader>

          <div class="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
            <Show
              when={!query.isLoading}
              fallback={
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconLoader class="h-4 w-4 animate-spin" />
                  Loading download events...
                </div>
              }
            >
              <Show
                when={events().length > 0}
                fallback={
                  <div class="text-sm text-muted-foreground">
                    No download events found for this selection.
                  </div>
                }
              >
                <div class="text-xs text-muted-foreground">
                  Showing {events().length} of {query.data?.total ?? 0} events
                </div>
                <For each={events()}>
                  {(event) => (
                    <div class="space-y-2">
                      <DownloadEventCard event={event} formatTimestamp={props.formatTimestamp} />
                      <div class="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setSelectedEvent(event)}>
                          Details
                        </Button>
                      </div>
                    </div>
                  )}
                </For>
                <div class="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!query.data?.prev_cursor}
                    onClick={() => {
                      setCursor(query.data?.prev_cursor);
                      setDirection("prev");
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!query.data?.next_cursor}
                    onClick={() => {
                      setCursor(query.data?.next_cursor);
                      setDirection("next");
                    }}
                  >
                    Next
                  </Button>
                </div>
              </Show>
            </Show>
          </div>
        </DialogContent>
      </Dialog>

      <DownloadEventDetailsDialog
        event={selectedEvent()}
        formatTimestamp={props.formatTimestamp}
        onOpenChange={(nextOpen) => !nextOpen && setSelectedEvent(null)}
      />
    </>
  );
}
