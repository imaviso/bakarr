import { IconLoader } from "@tabler/icons-solidjs";
import { createMemo, For, Show, type JSX } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
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
  loadingContent?: JSX.Element;
  loadingFallback?: JSX.Element;
  onSelectEvent?: ((event: DownloadEvent) => void) | undefined;
  showCount?: boolean;
  virtualized?: boolean;
  maxHeightPx?: number | undefined;
  class?: string | undefined;
}

export function DownloadEventsFeed(props: DownloadEventsFeedProps) {
  let scrollRef: HTMLDivElement | undefined;

  const showCount = () => props.showCount ?? true;
  const loadingFallback = props.loadingFallback ?? props.loadingContent ?? (
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <IconLoader class="h-4 w-4 animate-spin" />
      Loading download events...
    </div>
  );
  const isVirtualized = () => props.virtualized ?? false;

  const virtualizer = createVirtualizer({
    get count() {
      return props.events.length;
    },
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
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
    <Show when={!props.isLoading} fallback={loadingFallback}>
      <Show
        when={props.events.length > 0}
        fallback={<div class="text-sm text-muted-foreground">{props.emptyText}</div>}
      >
        <Show when={showCount()}>
          <div class="text-xs text-muted-foreground">
            Showing {props.events.length} of {props.total ?? props.events.length} events
          </div>
        </Show>

        <Show
          when={isVirtualized()}
          fallback={
            <div class={props.class ?? "space-y-3"}>
              <For each={props.events}>
                {(event) => (
                  <DownloadEventsFeedRow
                    event={event}
                    formatTimestamp={props.formatTimestamp}
                    onSelectEvent={props.onSelectEvent}
                  />
                )}
              </For>
            </div>
          }
        >
          <div
            ref={(element) => {
              scrollRef = element;
            }}
            class={props.class ?? "overflow-y-auto"}
            style={{
              ...(props.maxHeightPx === undefined
                ? {}
                : { "max-height": `${props.maxHeightPx}px` }),
              "overflow-anchor": "none",
            }}
          >
            <div style={{ height: `${paddingTop()}px` }} aria-hidden="true" />
            <div class="space-y-3">
              <For each={virtualizer.getVirtualItems()}>
                {(virtualRow) => {
                  const event = props.events[virtualRow.index];
                  if (!event) {
                    return null;
                  }

                  return (
                    <DownloadEventsFeedRow
                      event={event}
                      formatTimestamp={props.formatTimestamp}
                      onSelectEvent={props.onSelectEvent}
                    />
                  );
                }}
              </For>
            </div>
            <div style={{ height: `${paddingBottom()}px` }} aria-hidden="true" />
          </div>
        </Show>
      </Show>
    </Show>
  );
}

interface DownloadEventsFeedRowProps {
  event: DownloadEvent;
  formatTimestamp: (value: string) => string;
  onSelectEvent?: ((event: DownloadEvent) => void) | undefined;
}

function DownloadEventsFeedRow(props: DownloadEventsFeedRowProps) {
  return (
    <div class="space-y-2">
      <DownloadEventCard event={props.event} formatTimestamp={props.formatTimestamp} />
      <Show when={props.onSelectEvent}>
        {(onSelectEvent) => (
          <div class="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onSelectEvent()(props.event)}>
              Details
            </Button>
          </div>
        )}
      </Show>
    </div>
  );
}
