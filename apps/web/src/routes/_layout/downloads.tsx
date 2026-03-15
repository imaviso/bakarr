import {
  IconAlertTriangle,
  IconArrowDown,
  IconCheck,
  IconClock,
  IconDownload,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-solidjs";
import { createFileRoute } from "@tanstack/solid-router";
import { createMemo, For, Show } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { toast } from "solid-sonner";
import * as v from "valibot";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useActiveDownloads } from "~/hooks/use-active-downloads";
import {
  createDeleteDownloadMutation,
  createDownloadHistoryQuery,
  createPauseDownloadMutation,
  createReconcileDownloadMutation,
  createResumeDownloadMutation,
  createRetryDownloadMutation,
  createSearchMissingMutation,
  createSyncDownloadsMutation,
  type Download,
  downloadHistoryQueryOptions,
  type DownloadStatus,
} from "~/lib/api";

export const Route = createFileRoute("/_layout/downloads")({
  validateSearch: (search) => v.parse(v.object({}), search),
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(downloadHistoryQueryOptions());
  },
  component: DownloadsPage,
  errorComponent: GeneralError,
});

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  return `${parseFloat((bytesPerSec / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatEta(seconds: number): string {
  if (seconds === 8640000) return "∞";
  if (seconds <= 0) return "Done";

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function DownloadsPage() {
  let queueScrollRef!: HTMLDivElement;
  let historyScrollRef!: HTMLDivElement;

  const queue = useActiveDownloads();
  const historyQuery = createDownloadHistoryQuery();
  const searchMissing = createSearchMissingMutation();
  const syncDownloads = createSyncDownloadsMutation();

  const queueCount = () => queue.length;
  const history = createMemo(() => historyQuery.data ?? []);

  const queueVirtualizer = createVirtualizer({
    get count() {
      return queue.length;
    },
    estimateSize: () => 48,
    overscan: 10,
    getScrollElement: () => queueScrollRef,
  });
  const queuePaddingTop = createMemo(() => {
    const items = queueVirtualizer.getVirtualItems();
    return items.length > 0 ? items[0].start : 0;
  });
  const queuePaddingBottom = createMemo(() => {
    const items = queueVirtualizer.getVirtualItems();
    return items.length > 0
      ? queueVirtualizer.getTotalSize() - items[items.length - 1].end
      : 0;
  });

  const historyVirtualizer = createVirtualizer({
    get count() {
      return history().length;
    },
    estimateSize: () => 64,
    overscan: 10,
    getScrollElement: () => historyScrollRef,
  });
  const historyPaddingTop = createMemo(() => {
    const items = historyVirtualizer.getVirtualItems();
    return items.length > 0 ? items[0].start : 0;
  });
  const historyPaddingBottom = createMemo(() => {
    const items = historyVirtualizer.getVirtualItems();
    return items.length > 0
      ? historyVirtualizer.getTotalSize() - items[items.length - 1].end
      : 0;
  });

  return (
    <div class="flex flex-col flex-1 min-h-0 gap-4">
      <PageHeader
        title="Downloads"
        subtitle="Manage active downloads and history"
      >
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.promise(syncDownloads.mutateAsync(), {
                loading: "Syncing downloads...",
                success: "Download state synced",
                error: (err) => `Failed to sync downloads: ${err.message}`,
              })}
            disabled={syncDownloads.isPending}
          >
            <IconRefresh class="h-4 w-4" />
            Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.promise(searchMissing.mutateAsync(undefined), {
                loading: "Triggering global search...",
                success: "Global search triggered in background",
                error: (err) => `Failed to trigger search: ${err.message}`,
              })}
            disabled={searchMissing.isPending}
          >
            <IconSearch class="h-4 w-4" />
            Search Missing
          </Button>
        </div>
      </PageHeader>

      <Card class="flex-1 overflow-hidden flex flex-col">
        <Tabs defaultValue="queue" class="h-full flex flex-col">
          <div class="px-4 pt-3 border-b">
            <TabsList class="w-full justify-start h-auto p-0 pb-px bg-transparent border-b-0 space-x-6">
              <TabsTrigger
                value="queue"
                class="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent data-[selected]:bg-transparent"
              >
                Queue
                <Show when={queueCount() > 0}>
                  <Badge
                    variant="secondary"
                    class="ml-2 h-5 px-1.5 min-w-[1.25rem] text-[10px]"
                  >
                    {queueCount()}
                  </Badge>
                </Show>
              </TabsTrigger>
              <TabsTrigger
                value="history"
                class="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent data-[selected]:bg-transparent"
              >
                History
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="queue"
            class="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col"
          >
            <div ref={queueScrollRef} class="overflow-y-auto flex-1">
              <Table class="table-fixed">
                <TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
                  <TableRow class="hover:bg-transparent border-none">
                    <TableHead class="w-[50px]"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead class="w-[200px]">Progress</TableHead>
                    <TableHead class="w-[100px] hidden md:table-cell">
                      Speed
                    </TableHead>
                    <TableHead class="w-[100px] hidden md:table-cell">
                      ETA
                    </TableHead>
                    <TableHead class="w-[120px]">Status</TableHead>
                    <TableHead class="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Show
                    when={queue.length > 0}
                    fallback={
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          class="h-32 text-center text-muted-foreground"
                        >
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
                      {(vRow) => <ActiveDownloadRow item={queue[vRow.index]} />}
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

          <TabsContent
            value="history"
            class="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col"
          >
            <div ref={historyScrollRef} class="overflow-y-auto flex-1">
              <Table class="table-fixed">
                <TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
                  <TableRow class="hover:bg-transparent border-none">
                    <TableHead class="w-[50px]"></TableHead>
                    <TableHead>Anime</TableHead>
                    <TableHead class="w-[100px]">Episode</TableHead>
                    <TableHead class="w-[180px] hidden md:table-cell">
                      Added
                    </TableHead>
                    <TableHead class="w-[120px]">Status</TableHead>
                    <TableHead class="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Show
                    when={!historyQuery.isLoading}
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
                      when={history().length > 0}
                      fallback={
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            class="h-32 text-center text-muted-foreground"
                          >
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
                        {(vRow) => (
                          <DownloadRow item={history()[vRow.index]} isHistory />
                        )}
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
        </Tabs>
      </Card>
    </div>
  );
}

function ActiveDownloadRow(props: { item: DownloadStatus }) {
  const pauseDownload = createPauseDownloadMutation();
  const resumeDownload = createResumeDownloadMutation();
  const retryDownload = createRetryDownloadMutation();

  const handlePause = () => {
    if (!props.item.id) return;

    toast.promise(pauseDownload.mutateAsync(props.item.id), {
      loading: "Pausing download...",
      success: "Download paused",
      error: (err) => `Failed to pause download: ${err.message}`,
    });
  };

  const handleResume = () => {
    if (!props.item.id) return;

    toast.promise(resumeDownload.mutateAsync(props.item.id), {
      loading: "Resuming download...",
      success: "Download resumed",
      error: (err) => `Failed to resume download: ${err.message}`,
    });
  };

  const handleRetry = () => {
    if (!props.item.id) return;

    toast.promise(retryDownload.mutateAsync(props.item.id), {
      loading: "Retrying download...",
      success: "Download retried",
      error: (err) => `Failed to retry download: ${err.message}`,
    });
  };

  return (
    <TableRow class="group h-12">
      <TableCell class="py-2 pl-4">
        <Show
          when={!props.item.state.includes("Error")}
          fallback={<IconAlertTriangle class="w-4 h-4 text-error shrink-0" />}
        >
          <Show
            when={!props.item.state.includes("Paused")}
            fallback={<IconPlayerPause class="w-4 h-4 text-warning shrink-0" />}
          >
            <IconDownload class="w-4 h-4 text-info shrink-0 animate-pulse" />
          </Show>
        </Show>
      </TableCell>
      <TableCell class="font-medium">
        <div class="flex flex-col justify-center">
          <span class="line-clamp-1 text-sm" title={props.item.name}>
            {props.item.name}
          </span>
          <Show when={props.item.id !== undefined}>
            <span class="text-xs text-muted-foreground">#{props.item.id}</span>
          </Show>
        </div>
      </TableCell>
      <TableCell>
        <div class="flex items-center gap-2">
          <Progress
            value={props.item.progress * 100}
            class="h-1.5 w-full bg-muted"
          />
          <span class="text-xs font-mono text-muted-foreground w-8 text-right">
            {Math.round(props.item.progress * 100)}%
          </span>
        </div>
      </TableCell>
      <TableCell class="text-sm text-muted-foreground whitespace-nowrap tabular-nums hidden md:table-cell">
        {formatSpeed(props.item.speed)}
      </TableCell>
      <TableCell class="text-sm text-muted-foreground whitespace-nowrap tabular-nums hidden md:table-cell">
        {formatEta(props.item.eta)}
      </TableCell>
      <TableCell>
        <div class="flex items-center gap-2">
          <span class="capitalize text-sm text-muted-foreground">
            {props.item.state}
          </span>
        </div>
      </TableCell>
      <TableCell class="text-right">
        <div class="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Show
            when={props.item.state.toLowerCase().includes("paused") ||
              props.item.state.toLowerCase().includes("queued") ||
              props.item.state.toLowerCase().includes("error")}
            fallback={
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                aria-label="Pause download"
                onClick={handlePause}
                disabled={!props.item.id || pauseDownload.isPending}
              >
                <IconPlayerPause class="h-4 w-4" />
              </Button>
            }
          >
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7"
              aria-label="Resume download"
              onClick={handleResume}
              disabled={!props.item.id || resumeDownload.isPending}
            >
              <IconPlayerPlay class="h-4 w-4" />
            </Button>
          </Show>
          <Show when={props.item.state.toLowerCase().includes("error")}>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7"
              aria-label="Retry download"
              onClick={handleRetry}
              disabled={!props.item.id || retryDownload.isPending}
            >
              <IconRefresh class="h-4 w-4" />
            </Button>
          </Show>
        </div>
      </TableCell>
    </TableRow>
  );
}

function DownloadRow(props: { item: Download; isHistory?: boolean }) {
  const retryDownload = createRetryDownloadMutation();
  const reconcileDownload = createReconcileDownloadMutation();
  const deleteDownload = createDeleteDownloadMutation();

  const handleRetry = () => {
    toast.promise(retryDownload.mutateAsync(props.item.id), {
      loading: "Retrying download...",
      success: "Download retried",
      error: (err) => `Failed to retry download: ${err.message}`,
    });
  };

  const handleDelete = () => {
    toast.promise(deleteDownload.mutateAsync({ downloadId: props.item.id }), {
      loading: "Removing download...",
      success: "Download removed",
      error: (err) => `Failed to remove download: ${err.message}`,
    });
  };

  const handleReconcile = () => {
    toast.promise(reconcileDownload.mutateAsync(props.item.id), {
      loading: "Reconciling download...",
      success: "Download reconciled",
      error: (err) => `Failed to reconcile download: ${err.message}`,
    });
  };

  const getStatusIcon = (status?: string) => {
    if (!status) return <IconClock class="h-4 w-4 text-muted-foreground" />;

    switch (status.toLowerCase()) {
      case "completed":
        return <IconCheck class="h-4 w-4 text-success" />;
      case "downloading":
        return <IconArrowDown class="h-4 w-4 text-info animate-pulse" />;
      case "failed":
        return <IconX class="h-4 w-4 text-destructive" />;
      case "paused":
        return <IconPlayerPause class="h-4 w-4 text-warning" />;
      default:
        return <IconClock class="h-4 w-4 text-muted-foreground" />;
    }
  };

  const dateStr = props.item.download_date || props.item.added_at;

  return (
    <TableRow class="group h-12">
      <TableCell class="py-2 pl-4">
        {getStatusIcon(props.item.status)}
      </TableCell>
      <TableCell class="font-medium">
        <div class="flex flex-col justify-center">
          <span class="line-clamp-1">{props.item.anime_title}</span>
          <span class="text-xs text-muted-foreground line-clamp-1">
            {props.item.torrent_name}
          </span>
          <Show when={props.item.error_message}>
            <span class="text-xs text-destructive line-clamp-1">
              {props.item.error_message}
            </span>
          </Show>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" class="font-normal font-mono text-xs">
          {props.item.episode_number.toString().padStart(2, "0")}
        </Badge>
      </TableCell>
      <Show
        when={!props.isHistory}
        fallback={
          <TableCell class="text-muted-foreground text-sm whitespace-nowrap hidden md:table-cell">
            {dateStr ? new Date(dateStr).toLocaleString() : "-"}
          </TableCell>
        }
      >
        <TableCell>
          <Show
            when={props.item.status?.toLowerCase() === "downloading" &&
              props.item.progress !== undefined}
            fallback={<span class="text-muted-foreground text-sm">-</span>}
          >
            <div class="flex items-center gap-2">
              <Progress
                value={props.item.progress ?? 0}
                class="h-1.5 w-full bg-muted"
              />
              <span class="text-xs font-mono text-muted-foreground w-8 text-right">
                {Math.round(props.item.progress ?? 0)}%
              </span>
            </div>
          </Show>
        </TableCell>
      </Show>
      <TableCell>
        <div class="flex items-center gap-2">
          <span class="capitalize text-sm text-muted-foreground">
            {props.item.status || "Unknown"}
          </span>
        </div>
      </TableCell>
      <TableCell class="text-right">
        <div class="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Show
            when={props.item.status?.toLowerCase() === "completed" &&
              !props.item.reconciled_at}
          >
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7"
              aria-label="Mark as reconciled"
              onClick={handleReconcile}
              disabled={reconcileDownload.isPending}
            >
              <IconCheck class="h-4 w-4" />
            </Button>
          </Show>
          <Show
            when={props.item.status?.toLowerCase() === "failed" ||
              props.item.status?.toLowerCase() === "error"}
          >
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7"
              aria-label="Retry download"
              onClick={handleRetry}
              disabled={retryDownload.isPending}
            >
              <IconRefresh class="h-4 w-4" />
            </Button>
          </Show>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            aria-label="Remove download"
            onClick={handleDelete}
            disabled={deleteDownload.isPending}
          >
            <IconTrash class="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
