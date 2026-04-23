import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState } from "~/components/empty-state";
import { ActiveDownloadRow } from "~/components/downloads/download-rows";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TabsContent } from "~/components/ui/tabs";
import { TABLE_MIN_WIDTH } from "~/lib/ui-constants";
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
        <Table className="table-fixed w-full md:min-w-0" style={{ minWidth: TABLE_MIN_WIDTH }}>
          <TableHeader className="sticky top-0 bg-card z-10 border-b">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead scope="col" className="w-[50px]">
                <span className="sr-only">Status</span>
              </TableHead>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col" className="w-[200px]">
                Progress
              </TableHead>
              <TableHead scope="col" className="w-[100px] hidden md:table-cell">
                Speed
              </TableHead>
              <TableHead scope="col" className="w-[100px] hidden md:table-cell">
                ETA
              </TableHead>
              <TableHead scope="col" className="w-[120px]">
                Status
              </TableHead>
              <TableHead scope="col" className="w-[120px] text-right">
                Actions
              </TableHead>
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
              <EmptyState asTableCell colSpan={7} compact title="No active downloads" />
            )}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}
