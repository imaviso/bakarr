import { SpinnerIcon } from "@phosphor-icons/react";
import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DownloadEventCard } from "~/components/download-event-card";
import { Button } from "~/components/ui/button";
import type { DownloadEvent } from "~/lib/api";

const VIRTUAL_ROW_HEIGHT = 140;

interface DownloadEventsFeedProps {
  events: DownloadEvent[];
  formatTimestamp: (value: string) => string;
  isLoading: boolean;
  total?: number | undefined;
  emptyText: string;
  loadingContent?: ReactNode;
  loadingFallback?: ReactNode;
  onSelectEvent?: ((event: DownloadEvent) => void) | undefined;
  showCount?: boolean;
  virtualized?: boolean;
  maxHeightPx?: number | undefined;
  className?: string | undefined;
}

export function DownloadEventsFeed(props: DownloadEventsFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const showCount = props.showCount ?? true;
  const loadingFallback = props.loadingFallback ?? props.loadingContent ?? (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <SpinnerIcon className="h-4 w-4 animate-spin" />
      Loading download events...
    </div>
  );
  const isVirtualized = props.virtualized ?? false;

  const virtualizer = useVirtualizer({
    count: props.events.length,
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
    getScrollElement: () => scrollRef.current ?? null,
    overscan: 4,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const firstVirtualItem = virtualItems[0];
  const lastVirtualItem = virtualItems[virtualItems.length - 1];

  const paddingTop = firstVirtualItem ? firstVirtualItem.start : 0;
  const paddingBottom = lastVirtualItem ? virtualizer.getTotalSize() - lastVirtualItem.end : 0;

  return (
    <>
      {props.isLoading ? (
        loadingFallback
      ) : (
        <>
          {props.events.length === 0 ? (
            <div className="text-sm text-muted-foreground">{props.emptyText}</div>
          ) : (
            <>
              {showCount && (
                <div className="text-xs text-muted-foreground">
                  Showing {props.events.length} of {props.total ?? props.events.length} events
                </div>
              )}

              {isVirtualized ? (
                <div
                  ref={scrollRef}
                  className={props.className ?? "overflow-y-auto"}
                  style={{
                    ...(props.maxHeightPx === undefined
                      ? {}
                      : { maxHeight: `${props.maxHeightPx}px` }),
                    overflowAnchor: "none",
                  }}
                >
                  <div style={{ height: `${paddingTop}px` }} aria-hidden="true" />
                  <div className="space-y-3">
                    {virtualItems.map((virtualRow) => {
                      const event = props.events[virtualRow.index];
                      if (!event) {
                        return null;
                      }

                      return (
                        <DownloadEventsFeedRow
                          key={virtualRow.index}
                          event={event}
                          formatTimestamp={props.formatTimestamp}
                          onSelectEvent={props.onSelectEvent}
                        />
                      );
                    })}
                  </div>
                  <div style={{ height: `${paddingBottom}px` }} aria-hidden="true" />
                </div>
              ) : (
                <div className={props.className ?? "space-y-3"}>
                  {props.events.map((event) => (
                    <DownloadEventsFeedRow
                      key={event.id}
                      event={event}
                      formatTimestamp={props.formatTimestamp}
                      onSelectEvent={props.onSelectEvent}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

interface DownloadEventsFeedRowProps {
  event: DownloadEvent;
  formatTimestamp: (value: string) => string;
  onSelectEvent?: ((event: DownloadEvent) => void) | undefined;
}

function DownloadEventsFeedRow(props: DownloadEventsFeedRowProps) {
  return (
    <div className="space-y-2">
      <DownloadEventCard event={props.event} formatTimestamp={props.formatTimestamp} />
      {props.onSelectEvent && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => props.onSelectEvent!(props.event)}>
            Details
          </Button>
        </div>
      )}
    </div>
  );
}
