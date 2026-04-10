import { createMemo, For, Show } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { DownloadRow } from "~/components/downloads/download-rows";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { TabsContent } from "~/components/ui/tabs";
import type { DownloadsHistoryQuery } from "~/routes/_layout/downloads-view-types";
import type { Download } from "~/lib/api";

interface DownloadsHistoryTabProps {
  history: () => Download[];
  historyQuery: DownloadsHistoryQuery;
}

export function DownloadsHistoryTab(props: DownloadsHistoryTabProps) {
  let historyScrollRef: HTMLDivElement | undefined;

  const historyVirtualizer = createVirtualizer({
    get count() {
      return props.history().length;
    },
    estimateSize: () => 64,
    overscan: 10,
    getScrollElement: () => historyScrollRef ?? null,
  });

  const historyPaddingTop = createMemo(() => {
    const items = historyVirtualizer.getVirtualItems();
    const [first] = items;
    return first ? first.start : 0;
  });

  const historyPaddingBottom = createMemo(() => {
    const items = historyVirtualizer.getVirtualItems();
    const last = items[items.length - 1];
    return last ? historyVirtualizer.getTotalSize() - last.end : 0;
  });

  return (
    <TabsContent value="history" class="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col">
      <div
        ref={(element) => {
          historyScrollRef = element;
        }}
        class="overflow-y-auto flex-1"
      >
        <Table class="table-fixed min-w-[860px] md:min-w-0">
          <TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
            <TableRow class="hover:bg-transparent border-none">
              <TableHead class="w-[50px]">
                <span class="sr-only">Status</span>
              </TableHead>
              <TableHead>Anime</TableHead>
              <TableHead class="w-[100px]">Episode</TableHead>
              <TableHead class="w-[180px] hidden md:table-cell">Added</TableHead>
              <TableHead class="w-[120px]">Status</TableHead>
              <TableHead class="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Show
              when={!props.historyQuery.isLoading}
              fallback={
                <For each={[1, 2, 3, 4, 5]}>
                  {() => (
                    <TableRow>
                      <TableCell>
                        <Skeleton class="h-4 w-4" />
                      </TableCell>
                      <TableCell>
                        <Skeleton class="h-4 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton class="h-4 w-12" />
                      </TableCell>
                      <TableCell>
                        <Skeleton class="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton class="h-4 w-16" />
                      </TableCell>
                    </TableRow>
                  )}
                </For>
              }
            >
              <Show
                when={props.history().length > 0}
                fallback={
                  <TableRow>
                    <TableCell colSpan={6} class="h-32 text-center text-muted-foreground">
                      No download history
                    </TableCell>
                  </TableRow>
                }
              >
                <Show when={historyPaddingTop() > 0}>
                  <tr aria-hidden="true">
                    <td
                      colSpan={6}
                      style={{
                        height: `${historyPaddingTop()}px`,
                        padding: "0",
                        border: "none",
                      }}
                    />
                  </tr>
                </Show>
                <For each={historyVirtualizer.getVirtualItems()}>
                  {(virtualRow) => {
                    const item = () => props.history()[virtualRow.index];
                    return (
                      <Show when={item()}>
                        {(safeItem) => <DownloadRow item={safeItem()} isHistory />}
                      </Show>
                    );
                  }}
                </For>
                <Show when={historyPaddingBottom() > 0}>
                  <tr aria-hidden="true">
                    <td
                      colSpan={6}
                      style={{
                        height: `${historyPaddingBottom()}px`,
                        padding: "0",
                        border: "none",
                      }}
                    />
                  </tr>
                </Show>
              </Show>
            </Show>
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}
