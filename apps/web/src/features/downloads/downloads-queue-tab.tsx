import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  const queueScrollRef = useRef<HTMLDivElement>(null);

  const queueVirtualizer = useVirtualizer({
    count: props.queue.length,
    estimateSize: () => 48,
    overscan: 10,
    getScrollElement: () => queueScrollRef.current,
  });

  const virtualItems = queueVirtualizer.getVirtualItems();
  const firstItem = virtualItems[0];
  const lastItem = virtualItems[virtualItems.length - 1];
  const queuePaddingTop = firstItem ? firstItem.start : 0;
  const queuePaddingBottom = lastItem ? queueVirtualizer.getTotalSize() - lastItem.end : 0;

  return (
    <TabsContent value="queue" className="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col">
      <div ref={queueScrollRef} className="h-full min-h-0 overflow-auto">
        <Table className="table-fixed w-full min-w-[820px] md:min-w-0">
          <TableHeader className="sticky top-0 bg-card z-10 border-b">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="w-[50px]">
                <span className="sr-only">Status</span>
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[200px]">Progress</TableHead>
              <TableHead className="w-[100px] hidden md:table-cell">Speed</TableHead>
              <TableHead className="w-[100px] hidden md:table-cell">ETA</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.queue.length > 0 ? (
              <>
                {queuePaddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={7}
                      style={{
                        height: `${queuePaddingTop}px`,
                        padding: "0",
                        border: "none",
                      }}
                    />
                  </tr>
                )}
                {queueVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = props.queue[virtualRow.index];
                  return item ? <ActiveDownloadRow key={virtualRow.key} item={item} /> : null;
                })}
                {queuePaddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={7}
                      style={{
                        height: `${queuePaddingBottom}px`,
                        padding: "0",
                        border: "none",
                      }}
                    />
                  </tr>
                )}
              </>
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No active downloads
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}
