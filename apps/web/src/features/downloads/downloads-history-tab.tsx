import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import type { DownloadsHistoryQuery } from "~/features/downloads/downloads-view-types";
import type { Download } from "~/lib/api";

interface DownloadsHistoryTabProps {
  history: Download[];
  historyQuery: DownloadsHistoryQuery;
}

export function DownloadsHistoryTab(props: DownloadsHistoryTabProps) {
  const historyScrollRef = useRef<HTMLDivElement>(null);

  const historyVirtualizer = useVirtualizer({
    count: props.history.length,
    estimateSize: () => 64,
    overscan: 10,
    getScrollElement: () => historyScrollRef.current,
  });

  const virtualItems = historyVirtualizer.getVirtualItems();
  const firstItem = virtualItems[0];
  const lastItem = virtualItems[virtualItems.length - 1];
  const historyPaddingTop = firstItem ? firstItem.start : 0;
  const historyPaddingBottom = lastItem ? historyVirtualizer.getTotalSize() - lastItem.end : 0;

  return (
    <TabsContent value="history" className="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col">
      <div ref={historyScrollRef} className="h-full overflow-y-auto">
        <Table className="table-fixed min-w-[860px] md:min-w-0">
          <TableHeader className="sticky top-0 bg-card z-10 border-b">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="w-[50px]">
                <span className="sr-only">Status</span>
              </TableHead>
              <TableHead>Anime</TableHead>
              <TableHead className="w-[100px]">Episode</TableHead>
              <TableHead className="w-[180px] hidden md:table-cell">Added</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!props.historyQuery.isLoading ? (
              props.history.length > 0 ? (
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
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No download history
                  </TableCell>
                </TableRow>
              )
            ) : (
              [1, 2, 3, 4, 5].map((row) => (
                <TableRow key={row}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}
