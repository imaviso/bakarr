import { createMemo, For } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { Button } from "~/components/ui/button";
import { DownloadEventCard } from "~/components/download-event-card";
import type { DownloadEvent } from "~/lib/api";

const EVENT_ROW_HEIGHT_ESTIMATE = 140;
const EVENT_LIST_MAX_HEIGHT = 600;

interface DownloadEventsListProps {
  events: DownloadEvent[];
  formatTimestamp: (createdAt: string) => string;
  onSelectEvent: (event: DownloadEvent) => void;
}

export function DownloadEventsList(props: DownloadEventsListProps) {
  let scrollRef: HTMLDivElement | undefined;

  const virtualizer = createVirtualizer({
    get count() {
      return props.events.length;
    },
    estimateSize: () => EVENT_ROW_HEIGHT_ESTIMATE,
    getScrollElement: () => scrollRef ?? null,
    overscan: 4,
  });

  const paddingTop = createMemo(() => {
    const items = virtualizer.getVirtualItems();
    const [first] = items;
    return first ? first.start : 0;
  });
  const paddingBottom = createMemo(() => {
    const items = virtualizer.getVirtualItems();
    const last = items[items.length - 1];
    return last ? virtualizer.getTotalSize() - last.end : 0;
  });

  return (
    <div
      ref={(el) => {
        scrollRef = el;
      }}
      class="overflow-y-auto px-4 pb-4"
      style={{
        "max-height": `${EVENT_LIST_MAX_HEIGHT}px`,
        "overflow-anchor": "none",
      }}
    >
      <div style={{ height: `${paddingTop()}px` }} aria-hidden="true" />
      <div class="space-y-3">
        <For each={virtualizer.getVirtualItems()}>
          {(vRow) => {
            const event = props.events[vRow.index];
            if (!event) {
              return null;
            }
            return (
              <div class="space-y-2">
                <DownloadEventCard event={event} formatTimestamp={props.formatTimestamp} />
                <div class="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => props.onSelectEvent(event)}>
                    Details
                  </Button>
                </div>
              </div>
            );
          }}
        </For>
      </div>
      <div style={{ height: `${paddingBottom()}px` }} aria-hidden="true" />
    </div>
  );
}
