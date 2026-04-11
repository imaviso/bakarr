import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheck,
  IconEye,
  IconInfoCircle,
  IconLoader,
} from "@tabler/icons-solidjs";
import { createEffect, createMemo, For, Show, type JSX } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
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
import type { SystemLog } from "~/lib/api";
import { cn } from "~/lib/utils";

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
  let logsScrollRef: HTMLDivElement | undefined;
  let lastRequestedLength = -1;

  const rowVirtualizer = createVirtualizer({
    get count() {
      return props.logs.length;
    },
    estimateSize: () => 52,
    overscan: 10,
    getScrollElement: () => logsScrollRef ?? null,
  });

  const logsPaddingTop = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    const [first] = items;
    return first ? first.start : 0;
  });
  const logsPaddingBottom = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    const last = items[items.length - 1];
    return last ? rowVirtualizer.getTotalSize() - last.end : 0;
  });

  createEffect(() => {
    if (!props.hasNextPage) {
      lastRequestedLength = -1;
      return;
    }

    const items = rowVirtualizer.getVirtualItems();
    if (items.length === 0) return;
    const lastItem = items[items.length - 1];
    if (!lastItem) {
      return;
    }

    if (
      lastItem.index >= props.logs.length - 20 &&
      lastRequestedLength !== props.logs.length &&
      !props.isFetchingNextPage
    ) {
      lastRequestedLength = props.logs.length;
      props.onFetchNextPage();
    }
  });

  return (
    <CardShell
      hasNextPage={props.hasNextPage}
      isFetchingNextPage={props.isFetchingNextPage}
      onFetchNextPage={props.onFetchNextPage}
    >
      <div
        ref={(el) => {
          logsScrollRef = el;
        }}
        class="overflow-y-auto flex-1"
      >
        <Table>
          <TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
            <TableRow class="hover:bg-transparent border-none">
              <TableHead class="w-[160px]">Timestamp</TableHead>
              <TableHead class="w-[100px]">Level</TableHead>
              <TableHead class="w-[120px]">Source</TableHead>
              <TableHead>Message</TableHead>
              <TableHead class="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <Show
              when={!props.isLoading}
              fallback={
                <For each={[1, 2, 3, 4, 5]}>
                  {() => (
                    <TableRow>
                      <TableCell>
                        <Skeleton class="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton class="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton class="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton class="h-4 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton class="h-8 w-8" />
                      </TableCell>
                    </TableRow>
                  )}
                </For>
              }
            >
              <Show
                when={props.isError}
                fallback={
                  <Show
                    when={props.logs.length === 0}
                    fallback={
                      <>
                        <Show when={logsPaddingTop() > 0}>
                          <tr aria-hidden="true">
                            <td
                              colSpan={5}
                              style={{
                                height: `${logsPaddingTop()}px`,
                                padding: "0",
                                border: "none",
                              }}
                            />
                          </tr>
                        </Show>
                        <For each={rowVirtualizer.getVirtualItems()}>
                          {(vRow) => {
                            const log = () => props.logs[vRow.index];
                            return (
                              <Show when={log()}>
                                {(entry) => (
                                  <TableRow class="group">
                                    <TableCell class="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                      {props.formatTimestamp(entry().created_at)}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        class={cn(
                                          "text-xs capitalize pl-1 pr-2 py-0.5",
                                          getLevelColorClass(entry().level),
                                        )}
                                      >
                                        {getLevelIcon(entry().level)}
                                        {entry().level}
                                      </Badge>
                                    </TableCell>
                                    <TableCell class="text-xs font-medium text-muted-foreground capitalize">
                                      {entry().event_type}
                                    </TableCell>
                                    <TableCell class="text-sm max-w-[500px]">
                                      <div class="truncate" title={entry().message}>
                                        {entry().message}
                                      </div>
                                      <Show when={entry().details}>
                                        <div
                                          class="text-xs text-muted-foreground mt-0.5 font-mono truncate opacity-70"
                                          title={entry().details}
                                        >
                                          {entry().details}
                                        </div>
                                      </Show>
                                    </TableCell>
                                    <TableCell>
                                      <Show when={entry().details}>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          class="relative after:absolute after:-inset-2 h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                          onClick={() => props.onSelectLog(entry())}
                                          aria-label="View details"
                                        >
                                          <IconEye class="h-4 w-4" />
                                        </Button>
                                      </Show>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Show>
                            );
                          }}
                        </For>
                        <Show when={logsPaddingBottom() > 0}>
                          <tr aria-hidden="true">
                            <td
                              colSpan={5}
                              style={{
                                height: `${logsPaddingBottom()}px`,
                                padding: "0",
                                border: "none",
                              }}
                            />
                          </tr>
                        </Show>
                      </>
                    }
                  >
                    <TableRow>
                      <TableCell colSpan={5} class="h-24 text-center text-muted-foreground">
                        No logs found.
                      </TableCell>
                    </TableRow>
                  </Show>
                }
              >
                <TableRow>
                  <TableCell colSpan={5} class="h-24 text-center text-destructive">
                    Error loading logs. Please try again.
                  </TableCell>
                </TableRow>
              </Show>
            </Show>
          </TableBody>
        </Table>
      </div>
    </CardShell>
  );
}

function CardShell(props: {
  children: JSX.Element;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
}) {
  return (
    <>
      {props.children}
      <Show when={props.hasNextPage}>
        <div class="p-4 flex justify-center border-t shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onFetchNextPage}
            disabled={props.isFetchingNextPage}
          >
            <Show when={props.isFetchingNextPage} fallback="Load More Logs">
              <IconLoader class="h-4 w-4 animate-spin" />
              Loading...
            </Show>
          </Button>
        </div>
      </Show>
    </>
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
      return <IconAlertCircle class="h-3.5 w-3.5 mr-1" />;
    case "warn":
      return <IconAlertTriangle class="h-3.5 w-3.5 mr-1" />;
    case "success":
      return <IconCheck class="h-3.5 w-3.5 mr-1" />;
    case "info":
      return <IconInfoCircle class="h-3.5 w-3.5 mr-1" />;
    default:
      return <IconInfoCircle class="h-3.5 w-3.5 mr-1" />;
  }
}
