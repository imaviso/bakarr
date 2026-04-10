import { createMemo, For, Show } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { ActiveDownloadRow } from "~/components/downloads/download-rows";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { TabsContent } from "~/components/ui/tabs";
import type { DownloadStatus } from "~/lib/api";

interface DownloadsQueueTabProps {
  queue: DownloadStatus[];
}

export function DownloadsQueueTab(props: DownloadsQueueTabProps) {
  let queueScrollRef: HTMLDivElement | undefined;

  const queueVirtualizer = createVirtualizer({
    get count() {
      return props.queue.length;
    },
    estimateSize: () => 48,
    overscan: 10,
    getScrollElement: () => queueScrollRef ?? null,
  });

  const queuePaddingTop = createMemo(() => {
    const items = queueVirtualizer.getVirtualItems();
    const [first] = items;
    return first ? first.start : 0;
  });

  const queuePaddingBottom = createMemo(() => {
    const items = queueVirtualizer.getVirtualItems();
    const last = items[items.length - 1];
    return last ? queueVirtualizer.getTotalSize() - last.end : 0;
  });

  return (
    <TabsContent value="queue" class="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col">
      <div
        ref={(element) => {
          queueScrollRef = element;
        }}
        class="overflow-y-auto flex-1"
      >
        <Table class="table-fixed min-w-[820px] md:min-w-0">
          <TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
            <TableRow class="hover:bg-transparent border-none">
              <TableHead class="w-[50px]">
                <span class="sr-only">Status</span>
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead class="w-[200px]">Progress</TableHead>
              <TableHead class="w-[100px] hidden md:table-cell">Speed</TableHead>
              <TableHead class="w-[100px] hidden md:table-cell">ETA</TableHead>
              <TableHead class="w-[120px]">Status</TableHead>
              <TableHead class="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Show
              when={props.queue.length > 0}
              fallback={
                <TableRow>
                  <TableCell colSpan={7} class="h-32 text-center text-muted-foreground">
                    No active downloads
                  </TableCell>
                </TableRow>
              }
            >
              <Show when={queuePaddingTop() > 0}>
                <tr aria-hidden="true">
                  <td
                    colSpan={7}
                    style={{
                      height: `${queuePaddingTop()}px`,
                      padding: "0",
                      border: "none",
                    }}
                  />
                </tr>
              </Show>
              <For each={queueVirtualizer.getVirtualItems()}>
                {(virtualRow) => {
                  const item = () => props.queue[virtualRow.index];
                  return (
                    <Show when={item()}>
                      {(safeItem) => <ActiveDownloadRow item={safeItem()} />}
                    </Show>
                  );
                }}
              </For>
              <Show when={queuePaddingBottom() > 0}>
                <tr aria-hidden="true">
                  <td
                    colSpan={7}
                    style={{
                      height: `${queuePaddingBottom()}px`,
                      padding: "0",
                      border: "none",
                    }}
                  />
                </tr>
              </Show>
            </Show>
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}
