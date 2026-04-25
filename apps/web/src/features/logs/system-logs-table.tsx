import {
  WarningCircleIcon,
  WarningIcon,
  CheckIcon,
  EyeIcon,
  InfoIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { SystemLog } from "~/api";
import { cn } from "~/infra/utils";

interface SystemLogsTableProps {
  logs: SystemLog[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  formatTimestamp: (createdAt: string) => string;
  onFetchNextPage: () => void;
  onSelectLog: (entry: SystemLog) => void;
}

export function SystemLogsTable(props: SystemLogsTableProps) {
  const {
    logs,
    hasNextPage,
    isFetchingNextPage,
    onFetchNextPage,
    isLoading,
    isError,
    formatTimestamp,
    onSelectLog,
  } = props;

  const logsScrollRef = useRef<HTMLDivElement>(null);
  const lastRequestedLength = useRef(-1);

  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    estimateSize: () => 52,
    overscan: 10,
    getScrollElement: () => logsScrollRef.current ?? null,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  const logsPaddingTop = firstVirtualRow ? firstVirtualRow.start : 0;
  const logsPaddingBottom = lastVirtualRow ? rowVirtualizer.getTotalSize() - lastVirtualRow.end : 0;

  useEffect(() => {
    if (!hasNextPage) {
      lastRequestedLength.current = -1;
      return;
    }

    if (!lastVirtualRow) {
      return;
    }

    if (
      lastVirtualRow.index >= logs.length - 20 &&
      lastRequestedLength.current !== logs.length &&
      !isFetchingNextPage
    ) {
      lastRequestedLength.current = logs.length;
      onFetchNextPage();
    }
  }, [hasNextPage, logs.length, isFetchingNextPage, onFetchNextPage, lastVirtualRow]);

  return (
    <CardShell
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onFetchNextPage={onFetchNextPage}
    >
      <div ref={logsScrollRef} className="h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Table className="table-fixed w-full">
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead scope="col" className="w-[160px]">
                Timestamp
              </TableHead>
              <TableHead scope="col" className="w-[100px]">
                Level
              </TableHead>
              <TableHead scope="col" className="w-[180px]">
                Source
              </TableHead>
              <TableHead scope="col" className="w-full">
                Message
              </TableHead>
              <TableHead scope="col" className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading ? (
              !isError ? (
                logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No logs found.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {logsPaddingTop > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={5}
                          style={{
                            height: `${logsPaddingTop}px`,
                            padding: "0",
                            border: "none",
                          }}
                        />
                      </tr>
                    )}
                    {virtualRows.map((vRow) => {
                      const log = logs[vRow.index];
                      return log ? (
                        <TableRow key={log.id ?? vRow.index} className="group">
                          <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {formatTimestamp(log.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs capitalize pl-1 pr-2 py-0.5",
                                getLevelColorClass(log.level),
                              )}
                            >
                              {getLevelIcon(log.level)}
                              {log.level}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-medium text-muted-foreground">
                            <div className="truncate" title={log.event_type}>
                              {log.event_type}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm max-w-[500px]">
                            <div className="truncate" title={log.message}>
                              {log.message}
                            </div>
                            {log.details && (
                              <div
                                className="text-xs text-muted-foreground mt-0.5 font-mono truncate"
                                title={log.details}
                              >
                                {log.details}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.details && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="relative after:absolute after:-inset-2 h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                onClick={() => onSelectLog(log)}
                                aria-label="View details"
                              >
                                <EyeIcon className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null;
                    })}
                    {logsPaddingBottom > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={5}
                          style={{
                            height: `${logsPaddingBottom}px`,
                            padding: "0",
                            border: "none",
                          }}
                        />
                      </tr>
                    )}
                  </>
                )
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-destructive">
                    Error loading logs. Please try again.
                  </TableCell>
                </TableRow>
              )
            ) : (
              <>
                <TableRow key="log-skeleton-0">
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
                <TableRow key="log-skeleton-1">
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
                <TableRow key="log-skeleton-2">
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
                <TableRow key="log-skeleton-3">
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
                <TableRow key="log-skeleton-4">
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </CardShell>
  );
}

function CardShell(props: {
  children: ReactNode;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {props.children}
      {props.hasNextPage && (
        <div className="p-4 flex justify-center border-t shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onFetchNextPage}
            disabled={props.isFetchingNextPage}
          >
            {props.isFetchingNextPage ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More Logs"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function getLevelColorClass(level: string) {
  switch (level.toLowerCase()) {
    case "error":
      return "bg-error/15 text-error hover:bg-error/25 border-error/20";
    case "warn":
      return "bg-warning/15 text-warning hover:bg-warning/25 border-warning/20";
    case "success":
      return "bg-success/15 text-success hover:bg-success/25 border-success/20";
    case "info":
      return "bg-info/15 text-info hover:bg-info/25 border-info/20";
    default:
      return "";
  }
}

function getLevelIcon(level: string) {
  switch (level.toLowerCase()) {
    case "error":
      return <WarningCircleIcon className="h-3.5 w-3.5 mr-1" />;
    case "warn":
      return <WarningIcon className="h-3.5 w-3.5 mr-1" />;
    case "success":
      return <CheckIcon className="h-3.5 w-3.5 mr-1" />;
    case "info":
      return <InfoIcon className="h-3.5 w-3.5 mr-1" />;
    default:
      return <InfoIcon className="h-3.5 w-3.5 mr-1" />;
  }
}
