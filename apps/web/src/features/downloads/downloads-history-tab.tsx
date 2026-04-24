import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState } from "~/components/empty-state";
import { DownloadRow } from "~/components/downloads/download-rows";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TabsContent } from "~/components/ui/tabs";
import type { Download } from "~/lib/api";

interface DownloadsHistoryTabProps {
  history: Download[];
}

export function DownloadsHistoryTab(props: DownloadsHistoryTabProps) {
  const historyScrollRef = useRef<HTMLDivElement>(null);

  const historyVirtualizer = useVirtualizer({
    count: props.history.length,
    estimateSize: () => 64,
    overscan: 10,
    getItemKey: (index) => props.history[index]?.id ?? index,
    getScrollElement: () => historyScrollRef.current,
  });

  const virtualItems = historyVirtualizer.getVirtualItems();
  const firstItem = virtualItems[0];
  const lastItem = virtualItems[virtualItems.length - 1];
  const historyPaddingTop = firstItem ? firstItem.start : 0;
  const historyPaddingBottom = lastItem ? historyVirtualizer.getTotalSize() - lastItem.end : 0;

  return (
    <TabsContent value="history" className="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col">
      <div ref={historyScrollRef} className="h-full min-h-0 w-full flex-1 overflow-auto">
        <Table className="table-fixed w-full min-w-[860px] md:min-w-0">
          <TableHeader className="sticky top-0 bg-card z-10 border-b">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead scope="col" className="w-[50px]">
                <span className="sr-only">Status</span>
              </TableHead>
              <TableHead scope="col">Anime</TableHead>
              <TableHead scope="col" className="w-[100px]">
                Episode
              </TableHead>
              <TableHead scope="col" className="w-[180px] hidden md:table-cell">
                Added
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
            {props.history.length > 0 ? (
              <>
                {historyPaddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={6}
                      style={{
                        height: `${historyPaddingTop}px`,
                        padding: "0",
                        border: "none",
                      }}
                    />
                  </tr>
                )}
                {historyVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = props.history[virtualRow.index];
                  return item ? <DownloadRow key={virtualRow.key} item={item} isHistory /> : null;
                })}
                {historyPaddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={6}
                      style={{
                        height: `${historyPaddingBottom}px`,
                        padding: "0",
                        border: "none",
                      }}
                    />
                  </tr>
                )}
              </>
            ) : (
              <EmptyState asTableCell colSpan={6} compact title="No download history" />
            )}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}
