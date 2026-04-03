import {
  IconAlertTriangle,
  IconArrowDown,
  IconCheck,
  IconClock,
  IconDownload,
  IconExternalLink,
  IconFileSpreadsheet,
  IconJson,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-solidjs";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { toast } from "solid-sonner";
import * as v from "valibot";
import { GeneralError } from "~/components/general-error";
import { DownloadEventCard } from "~/components/download-event-card";
import { PageHeader } from "~/components/page-header";
import { DownloadEventsDialog } from "~/components/download-events-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useActiveDownloads } from "~/hooks/use-active-downloads";
import {
  createDeleteDownloadMutation,
  createDownloadEventsQuery,
  createDownloadHistoryQuery,
  createPauseDownloadMutation,
  createReconcileDownloadMutation,
  createResumeDownloadMutation,
  createRetryDownloadMutation,
  createSearchMissingMutation,
  createSyncDownloadsMutation,
  type Download,
  type DownloadEventsExportInput,
  type DownloadEventsExportResult,
  downloadHistoryQueryOptions,
  type DownloadStatus,
  exportDownloadEvents,
} from "~/lib/api";
import {
  formatSelectionDetail,
  releaseConfidenceBadgeClass,
  selectionKindBadgeClass,
  selectionKindLabel,
} from "~/lib/release-selection";
import {
  formatCoverageMeta,
  formatDownloadDecisionBadge,
  formatDownloadDecisionSummary,
  formatDownloadParsedMeta,
  formatDownloadRankingMeta,
  formatDownloadReleaseMeta,
  formatEpisodeCoverage,
  getDownloadReleaseConfidence,
} from "~/lib/download-metadata";
import { formatDateTimeLocalInput, getDateRangePresetHours } from "~/lib/date-presets";
import { getDownloadStatusPresentation } from "~/lib/download-status";

function animeInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

const DownloadsSearchSchema = v.object({
  events_anime_id: v.optional(v.string(), ""),
  events_cursor: v.optional(v.string(), ""),
  events_direction: v.optional(v.picklist(["next", "prev"]), "next"),
  events_download_id: v.optional(v.string(), ""),
  events_end_date: v.optional(v.string(), ""),
  events_event_type: v.optional(v.string(), "all"),
  events_start_date: v.optional(v.string(), ""),
  events_status: v.optional(v.string(), ""),
  tab: v.optional(v.picklist(["events", "history", "queue"]), "queue"),
});

type DownloadsTab = "events" | "history" | "queue";

function toDownloadsTab(value: string | null | undefined): DownloadsTab {
  if (value === "events" || value === "history" || value === "queue") {
    return value;
  }
  return "queue";
}

function DownloadStatusIcon(props: { status?: string }) {
  const presentation = createMemo(() => getDownloadStatusPresentation(props.status));

  const icon = () => {
    switch (presentation().icon) {
      case "alert":
        return <IconAlertTriangle class="h-4 w-4 text-destructive shrink-0" />;
      case "arrow-down":
        return <IconArrowDown class="h-4 w-4 text-info shrink-0" />;
      case "check":
        return <IconCheck class="h-4 w-4 text-success shrink-0" />;
      case "pause":
        return <IconPlayerPause class="h-4 w-4 text-warning shrink-0" />;
      default:
        return <IconClock class="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  return <>{icon()}</>;
}

export const Route = createFileRoute("/_layout/downloads")({
  validateSearch: (search) => v.parse(DownloadsSearchSchema, search),
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

function parseOptionalPositiveInt(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function DownloadsPage() {
  let queueScrollRef: HTMLDivElement | undefined;
  let historyScrollRef: HTMLDivElement | undefined;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [lastDownloadEventsExport, setLastDownloadEventsExport] = createSignal<
    DownloadEventsExportResult | undefined
  >(undefined);

  const queue = useActiveDownloads();
  const historyQuery = createDownloadHistoryQuery();
  const downloadEventsQuery = createDownloadEventsQuery(() => ({
    animeId: parseOptionalPositiveInt(search().events_anime_id),
    cursor: search().events_cursor || undefined,
    downloadId: parseOptionalPositiveInt(search().events_download_id),
    direction: search().events_direction,
    endDate: search().events_end_date || undefined,
    eventType: search().events_event_type === "all" ? undefined : search().events_event_type,
    limit: 24,
    startDate: search().events_start_date || undefined,
    status: search().events_status || undefined,
  }));
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
    getScrollElement: () => queueScrollRef ?? null,
  });
  const queuePaddingTop = createMemo(() => {
    const items = queueVirtualizer.getVirtualItems();
    return items.length > 0 ? items[0].start : 0;
  });
  const queuePaddingBottom = createMemo(() => {
    const items = queueVirtualizer.getVirtualItems();
    return items.length > 0 ? queueVirtualizer.getTotalSize() - items[items.length - 1].end : 0;
  });

  const historyVirtualizer = createVirtualizer({
    get count() {
      return history().length;
    },
    estimateSize: () => 64,
    overscan: 10,
    getScrollElement: () => historyScrollRef ?? null,
  });
  const historyPaddingTop = createMemo(() => {
    const items = historyVirtualizer.getVirtualItems();
    return items.length > 0 ? items[0].start : 0;
  });
  const historyPaddingBottom = createMemo(() => {
    const items = historyVirtualizer.getVirtualItems();
    return items.length > 0 ? historyVirtualizer.getTotalSize() - items[items.length - 1].end : 0;
  });

  const updateSearch = (patch: Partial<ReturnType<typeof search>>) => {
    void navigate({
      to: ".",
      search: { ...search(), ...patch },
      replace: true,
    });
  };
  const activeEventsPreset = createMemo(() =>
    getDateRangePresetHours(search().events_start_date, search().events_end_date),
  );

  const applyEventsDateRangePreset = (hours: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    updateSearch({
      events_cursor: "",
      events_direction: "next",
      events_end_date: formatDateTimeLocalInput(end),
      events_start_date: formatDateTimeLocalInput(start),
    });
  };

  const handleDownloadEventsExport = (format: "json" | "csv") => {
    const input: DownloadEventsExportInput = {
      animeId: parseOptionalPositiveInt(search().events_anime_id),
      downloadId: parseOptionalPositiveInt(search().events_download_id),
      endDate: search().events_end_date || undefined,
      eventType: search().events_event_type === "all" ? undefined : search().events_event_type,
      limit: 10_000,
      order: "desc",
      startDate: search().events_start_date || undefined,
      status: search().events_status || undefined,
    };

    const exportPromise = exportDownloadEvents(input, format).then((result) => {
      setLastDownloadEventsExport(result);
      return result;
    });

    toast.promise(exportPromise, {
      loading: `Exporting ${format.toUpperCase()} download events...`,
      success: (result) =>
        result.truncated
          ? `Exported ${result.exported} of ${result.total} events (truncated at ${result.limit})`
          : `Exported ${result.exported} download events`,
      error: (error) => `Failed to export download events: ${error.message}`,
    });
  };

  return (
    <div class="flex flex-col flex-1 min-h-0 gap-4">
      <PageHeader title="Downloads" subtitle="Manage active downloads and history">
        <div class="flex items-center gap-2">
          <DownloadEventsDialog
            description="Recent queue, retry, status, and import events across all downloads."
            formatTimestamp={(value) => new Date(value).toLocaleString()}
            limit={50}
            showTriggerLabel
            title="Download Event Feed"
            triggerLabel="Browse Events"
            triggerSize="sm"
            triggerVariant="outline"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.promise(syncDownloads.mutateAsync(), {
                loading: "Syncing downloads...",
                success: "Download state synced",
                error: (err) => `Failed to sync downloads: ${err.message}`,
              })
            }
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
              })
            }
            disabled={searchMissing.isPending}
          >
            <IconSearch class="h-4 w-4" />
            Search Missing
          </Button>
        </div>
      </PageHeader>

      <Card class="flex-1 overflow-hidden flex flex-col">
        <Tabs
          value={search().tab}
          onChange={(value) =>
            updateSearch({
              tab: toDownloadsTab(value),
            })
          }
          class="h-full flex flex-col"
        >
          <div class="px-4 pt-3 border-b">
            <TabsList class="w-full justify-start h-auto p-0 pb-px bg-transparent border-b-0 space-x-6">
              <TabsTrigger
                value="queue"
                class="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent data-[selected]:bg-transparent"
              >
                Queue
                <Show when={queueCount() > 0}>
                  <Badge variant="secondary" class="ml-2 h-5 px-1.5 min-w-[1.25rem] text-xs">
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
              <TabsTrigger
                value="events"
                class="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent data-[selected]:bg-transparent"
              >
                Events
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="queue" class="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col">
            <div
              ref={(el) => {
                queueScrollRef = el;
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
                    when={queue.length > 0}
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
                      {(vRow) => {
                        const item = () => queue[vRow.index];
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

          <TabsContent value="events" class="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col">
            <div class="p-4 border-b border-border/60 space-y-3">
              <div class="grid gap-3 md:grid-cols-[1fr_1fr_240px_auto]">
                <TextField>
                  <TextFieldLabel>Anime ID</TextFieldLabel>
                  <TextFieldInput
                    type="number"
                    value={search().events_anime_id}
                    onInput={(event) =>
                      updateSearch({
                        events_cursor: "",
                        events_direction: "next",
                        events_anime_id: event.currentTarget.value,
                      })
                    }
                    placeholder="Any anime"
                  />
                </TextField>
                <TextField>
                  <TextFieldLabel>Download ID</TextFieldLabel>
                  <TextFieldInput
                    type="number"
                    value={search().events_download_id}
                    onInput={(event) =>
                      updateSearch({
                        events_cursor: "",
                        events_direction: "next",
                        events_download_id: event.currentTarget.value,
                      })
                    }
                    placeholder="Any download"
                  />
                </TextField>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium" for="events-event-type">
                    Event Type
                  </label>
                  <Select
                    name="events-event-type"
                    value={search().events_event_type}
                    onChange={(value) =>
                      value &&
                      updateSearch({
                        events_cursor: "",
                        events_direction: "next",
                        events_event_type: value,
                      })
                    }
                    options={[
                      "all",
                      "download.queued",
                      "download.imported",
                      "download.imported.batch",
                      "download.retried",
                      "download.status_changed",
                      "download.coverage_refined",
                      "download.deleted",
                      "download.search_missing.queued",
                      "download.rss.queued",
                    ]}
                    itemComponent={(props) => (
                      <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
                    )}
                  >
                    <SelectTrigger id="events-event-type">
                      <SelectValue<string>>
                        {(state) => state.selectedOption() ?? "all"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>
                <div class="flex items-end gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger as={Button} variant="outline">
                      <IconDownload class="h-4 w-4" />
                      Export
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleDownloadEventsExport("json")}>
                        <IconJson class="h-4 w-4 mr-2" />
                        Export as JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadEventsExport("csv")}>
                        <IconFileSpreadsheet class="h-4 w-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div class="grid gap-3 md:grid-cols-[220px_220px_220px_auto]">
                <TextField>
                  <TextFieldLabel>Status</TextFieldLabel>
                  <TextFieldInput
                    value={search().events_status}
                    onInput={(event) =>
                      updateSearch({
                        events_cursor: "",
                        events_direction: "next",
                        events_status: event.currentTarget.value,
                      })
                    }
                    placeholder="Any status"
                  />
                </TextField>
                <TextField>
                  <TextFieldLabel>Start Date</TextFieldLabel>
                  <TextFieldInput
                    type="datetime-local"
                    value={search().events_start_date}
                    onInput={(event) =>
                      updateSearch({
                        events_cursor: "",
                        events_direction: "next",
                        events_start_date: event.currentTarget.value,
                      })
                    }
                  />
                </TextField>
                <TextField>
                  <TextFieldLabel>End Date</TextFieldLabel>
                  <TextFieldInput
                    type="datetime-local"
                    value={search().events_end_date}
                    onInput={(event) =>
                      updateSearch({
                        events_cursor: "",
                        events_direction: "next",
                        events_end_date: event.currentTarget.value,
                      })
                    }
                  />
                </TextField>
                <div class="flex items-end justify-end gap-2 flex-wrap">
                  <Button
                    variant={activeEventsPreset() === 24 ? "default" : "outline"}
                    size="sm"
                    onClick={() => applyEventsDateRangePreset(24)}
                  >
                    24h
                  </Button>
                  <Button
                    variant={activeEventsPreset() === 168 ? "default" : "outline"}
                    size="sm"
                    onClick={() => applyEventsDateRangePreset(24 * 7)}
                  >
                    7d
                  </Button>
                  <Button
                    variant={activeEventsPreset() === 720 ? "default" : "outline"}
                    size="sm"
                    onClick={() => applyEventsDateRangePreset(24 * 30)}
                  >
                    30d
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      updateSearch({
                        events_anime_id: "",
                        events_cursor: "",
                        events_direction: "next",
                        events_download_id: "",
                        events_end_date: "",
                        events_event_type: "all",
                        events_start_date: "",
                        events_status: "",
                      })
                    }
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            </div>
            <Show when={lastDownloadEventsExport()?.truncated}>
              <div class="mx-4 mt-4 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                Last export was truncated: exported
                {lastDownloadEventsExport()?.exported} of
                {lastDownloadEventsExport()?.total} events (limit{" "}
                {lastDownloadEventsExport()?.limit}).
              </div>
            </Show>
            <div class="flex-1 overflow-y-auto p-4 space-y-3">
              <Show
                when={!downloadEventsQuery.isLoading}
                fallback={<Skeleton class="h-28 w-full" />}
              >
                <Show
                  when={(downloadEventsQuery.data?.events.length ?? 0) > 0}
                  fallback={
                    <div class="text-sm text-muted-foreground">No download events found.</div>
                  }
                >
                  <div class="text-xs text-muted-foreground">
                    Showing {downloadEventsQuery.data?.events.length ?? 0} of{" "}
                    {downloadEventsQuery.data?.total ?? 0} events
                  </div>
                  <For each={downloadEventsQuery.data?.events ?? []}>
                    {(event) => (
                      <DownloadEventCard
                        event={event}
                        formatTimestamp={(value) => new Date(value).toLocaleString()}
                      />
                    )}
                  </For>
                </Show>
              </Show>
            </div>
            <div class="p-4 border-t border-border/60 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  updateSearch({
                    events_cursor: downloadEventsQuery.data?.prev_cursor ?? "",
                    events_direction: "prev",
                  })
                }
                disabled={!downloadEventsQuery.data?.prev_cursor}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  updateSearch({
                    events_cursor: downloadEventsQuery.data?.next_cursor ?? "",
                    events_direction: "next",
                  })
                }
                disabled={!downloadEventsQuery.data?.has_more}
              >
                Next
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="history" class="flex-1 mt-0 min-h-0 overflow-hidden flex flex-col">
            <div
              ref={(el) => {
                historyScrollRef = el;
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
                        {(vRow) => {
                          const item = () => history()[vRow.index];
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
        </Tabs>
      </Card>
    </div>
  );
}

function ActiveDownloadRow(props: { item: DownloadStatus }) {
  const pauseDownload = createPauseDownloadMutation();
  const resumeDownload = createResumeDownloadMutation();
  const retryDownload = createRetryDownloadMutation();
  const releaseConfidence = () => getDownloadReleaseConfidence(props.item);
  const statusPresentation = () => getDownloadStatusPresentation(props.item.state);

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
    <TableRow class="group h-12 align-top">
      <TableCell class="py-2 pl-4 w-[42px]">
        <DownloadStatusIcon status={props.item.state} />
      </TableCell>
      <TableCell class="font-medium py-2 min-w-[280px] md:min-w-[320px]">
        <div class="flex items-start gap-3">
          <Avatar class="size-8 rounded-md">
            <AvatarImage
              src={props.item.anime_image}
              alt={props.item.anime_title ?? props.item.name}
            />
            <AvatarFallback class="rounded-md text-xs font-medium">
              {animeInitials(props.item.anime_title ?? props.item.name)}
            </AvatarFallback>
          </Avatar>
          <div class="flex flex-col justify-center min-w-0">
            <div class="flex items-center gap-2 min-w-0 flex-wrap">
              <Show when={props.item.anime_id && props.item.anime_title}>
                <Link
                  to="/anime/$id"
                  params={{ id: props.item.anime_id!.toString() }}
                  class="line-clamp-1 text-sm hover:underline min-w-0 max-w-full"
                  title={props.item.anime_title}
                >
                  {props.item.anime_title}
                </Link>
              </Show>
              <Show when={formatDownloadDecisionBadge(props.item)}>
                {(badge) => (
                  <Badge variant="secondary" class="h-5 px-1.5 text-xs shrink-0">
                    <IconSparkles class="h-3 w-3" />
                    {badge()}
                  </Badge>
                )}
              </Show>
            </div>
            <span class="line-clamp-1 text-xs text-muted-foreground" title={props.item.name}>
              {props.item.name}
            </span>
            <Show
              when={formatDownloadReleaseMeta({
                group: props.item.source_metadata?.group,
                indexer: props.item.source_metadata?.indexer,
                quality: props.item.source_metadata?.quality,
                resolution: props.item.source_metadata?.resolution,
              })}
            >
              {(meta) => <span class="text-xs text-muted-foreground line-clamp-1">{meta()}</span>}
            </Show>
            <Show when={formatDownloadDecisionSummary(props.item)}>
              {(summary) => (
                <span class="text-[11px] text-muted-foreground line-clamp-1">{summary()}</span>
              )}
            </Show>
            <Show when={formatDownloadParsedMeta(props.item)}>
              {(parsedMeta) => (
                <span class="text-[11px] text-muted-foreground line-clamp-1">{parsedMeta()}</span>
              )}
            </Show>
            <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
              <Show when={props.item.source_metadata?.trusted}>
                <Badge
                  variant="outline"
                  class="h-4 px-1.5 border-success/20 bg-success/5 text-success"
                >
                  Trusted
                </Badge>
              </Show>
              <Show when={props.item.source_metadata?.remake}>
                <Badge
                  variant="outline"
                  class="h-4 px-1.5 border-warning/20 bg-warning/5 text-warning"
                >
                  Remake
                </Badge>
              </Show>
              <Show when={props.item.source_metadata?.source_url}>
                {(sourceUrl) => (
                  <a
                    href={sourceUrl()}
                    target="_blank"
                    rel="noreferrer"
                    class="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                  >
                    <IconExternalLink class="h-3 w-3" /> Source
                  </a>
                )}
              </Show>
            </div>
            <Show when={formatDownloadRankingMeta(props.item)}>
              <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
                <Show when={selectionKindLabel(props.item.source_metadata?.selection_kind)}>
                  {(label) => (
                    <Badge
                      variant="secondary"
                      class={`h-4 px-1.5 ${selectionKindBadgeClass(
                        props.item.source_metadata?.selection_kind,
                      )}`}
                    >
                      {label()}
                    </Badge>
                  )}
                </Show>
                <Show when={formatSelectionDetail(props.item.source_metadata ?? {})}>
                  {(detail) => (
                    <span class="text-muted-foreground/80 line-clamp-1">{detail()}</span>
                  )}
                </Show>
              </div>
            </Show>
            <Show when={releaseConfidence()}>
              {(confidence) => (
                <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
                  <Badge
                    variant="secondary"
                    class={`h-4 px-1.5 ${releaseConfidenceBadgeClass(confidence().tone)}`}
                  >
                    {confidence().label}
                  </Badge>
                  <span class="text-muted-foreground/80 line-clamp-1">{confidence().reason}</span>
                </div>
              )}
            </Show>
            <Show
              when={
                props.item.is_batch ||
                props.item.covered_episodes?.length ||
                props.item.coverage_pending
              }
            >
              <span class="text-xs text-muted-foreground line-clamp-1">
                {formatEpisodeCoverage(
                  props.item.episode_number ?? 1,
                  props.item.covered_episodes,
                  props.item.coverage_pending,
                )}
              </span>
            </Show>
            <Show when={props.item.id !== undefined}>
              <span class="text-xs text-muted-foreground">#{props.item.id}</span>
            </Show>
          </div>
        </div>
      </TableCell>
      <TableCell class="py-2 min-w-[160px] md:min-w-[180px]">
        <div class="flex items-center gap-2">
          <Progress value={props.item.progress * 100} class="h-1.5 w-full bg-muted" />
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
      <TableCell class="py-2">
        <div class="flex items-center gap-2">
          <span class="capitalize text-sm text-muted-foreground">{statusPresentation().label}</span>
        </div>
      </TableCell>
      <TableCell class="text-right py-2 pr-4">
        <div class="flex items-center justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Show
            when={
              statusPresentation().label.toLowerCase().includes("paused") ||
              statusPresentation().label.toLowerCase().includes("queued") ||
              statusPresentation().tone === "destructive"
            }
            fallback={
              <Button
                variant="ghost"
                size="icon"
                class="relative after:absolute after:-inset-2 h-7 w-7"
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
              class="relative after:absolute after:-inset-2 h-7 w-7"
              aria-label="Resume download"
              onClick={handleResume}
              disabled={!props.item.id || resumeDownload.isPending}
            >
              <IconPlayerPlay class="h-4 w-4" />
            </Button>
          </Show>
          <DownloadEventsDialog
            description="Timeline of queue, status, and import events for this download."
            downloadId={props.item.id}
            formatTimestamp={(value) => new Date(value).toLocaleString()}
            title={`Download Events${props.item.anime_title ? ` - ${props.item.anime_title}` : ""}`}
            triggerLabel="View download events"
          />
          <Show when={statusPresentation().tone === "destructive"}>
            <Button
              variant="ghost"
              size="icon"
              class="relative after:absolute after:-inset-2 h-7 w-7"
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
  const releaseConfidence = () => getDownloadReleaseConfidence(props.item);
  const statusPresentation = () => getDownloadStatusPresentation(props.item.status);

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

  const dateStr = props.item.download_date || props.item.added_at;

  return (
    <TableRow class="group h-12 align-top">
      <TableCell class="py-2 pl-4 w-[42px]">
        <DownloadStatusIcon status={props.item.status} />
      </TableCell>
      <TableCell class="font-medium py-2 min-w-[280px] md:min-w-[320px]">
        <div class="flex items-start gap-3">
          <Avatar class="size-8 rounded-md">
            <AvatarImage src={props.item.anime_image} alt={props.item.anime_title} />
            <AvatarFallback class="rounded-md text-xs font-medium">
              {animeInitials(props.item.anime_title)}
            </AvatarFallback>
          </Avatar>
          <div class="flex flex-col justify-center min-w-0">
            <div class="flex items-center gap-2 min-w-0 flex-wrap">
              <Link
                to="/anime/$id"
                params={{ id: props.item.anime_id.toString() }}
                class="line-clamp-1 hover:underline min-w-0 max-w-full"
                title={props.item.anime_title}
              >
                {props.item.anime_title}
              </Link>
              <Show when={formatDownloadDecisionBadge(props.item)}>
                {(badge) => (
                  <Badge variant="secondary" class="h-5 px-1.5 text-xs shrink-0">
                    <IconSparkles class="h-3 w-3" />
                    {badge()}
                  </Badge>
                )}
              </Show>
            </div>
            <span class="text-xs text-muted-foreground line-clamp-1">
              {props.item.torrent_name}
            </span>
            <Show
              when={formatDownloadReleaseMeta({
                group: props.item.source_metadata?.group ?? props.item.group_name,
                indexer: props.item.source_metadata?.indexer,
                quality: props.item.source_metadata?.quality,
                resolution: props.item.source_metadata?.resolution,
              })}
            >
              {(meta) => <span class="text-xs text-muted-foreground line-clamp-1">{meta()}</span>}
            </Show>
            <Show when={formatDownloadDecisionSummary(props.item)}>
              {(summary) => (
                <span class="text-[11px] text-muted-foreground line-clamp-1">{summary()}</span>
              )}
            </Show>
            <Show when={formatDownloadParsedMeta(props.item)}>
              {(parsedMeta) => (
                <span class="text-[11px] text-muted-foreground line-clamp-1">{parsedMeta()}</span>
              )}
            </Show>
            <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
              <Show when={props.item.source_metadata?.trusted}>
                <Badge
                  variant="outline"
                  class="h-4 px-1.5 border-success/20 bg-success/5 text-success"
                >
                  Trusted
                </Badge>
              </Show>
              <Show when={props.item.source_metadata?.remake}>
                <Badge
                  variant="outline"
                  class="h-4 px-1.5 border-warning/20 bg-warning/5 text-warning"
                >
                  Remake
                </Badge>
              </Show>
            </div>
            <Show when={formatDownloadRankingMeta(props.item)}>
              <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
                <Show when={selectionKindLabel(props.item.source_metadata?.selection_kind)}>
                  {(label) => (
                    <Badge
                      variant="secondary"
                      class={`h-4 px-1.5 ${selectionKindBadgeClass(
                        props.item.source_metadata?.selection_kind,
                      )}`}
                    >
                      {label()}
                    </Badge>
                  )}
                </Show>
                <Show when={formatSelectionDetail(props.item.source_metadata ?? {})}>
                  {(detail) => (
                    <span class="text-muted-foreground/80 line-clamp-1">{detail()}</span>
                  )}
                </Show>
              </div>
            </Show>
            <Show when={releaseConfidence()}>
              {(confidence) => (
                <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
                  <Badge
                    variant="secondary"
                    class={`h-4 px-1.5 ${releaseConfidenceBadgeClass(confidence().tone)}`}
                  >
                    {confidence().label}
                  </Badge>
                  <span class="text-muted-foreground/80 line-clamp-1">{confidence().reason}</span>
                </div>
              )}
            </Show>
            <Show when={props.item.imported_path}>
              {(importedPath) => (
                <span class="text-[11px] text-muted-foreground line-clamp-1">
                  Imported to {importedPath()}
                </span>
              )}
            </Show>
            <Show when={props.item.source_metadata?.source_url}>
              {(sourceUrl) => (
                <a
                  href={sourceUrl()}
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 w-fit"
                >
                  <IconExternalLink class="h-3 w-3" /> Source
                </a>
              )}
            </Show>
            <Show when={props.item.error_message}>
              <span class="text-xs text-destructive line-clamp-1">{props.item.error_message}</span>
            </Show>
          </div>
        </div>
      </TableCell>
      <TableCell class="py-2 min-w-[110px] md:min-w-[120px]">
        <Badge variant="outline" class="font-normal font-mono text-xs">
          {formatEpisodeCoverage(
            props.item.episode_number,
            props.item.covered_episodes,
            props.item.coverage_pending,
          )}
        </Badge>
        <Show when={formatCoverageMeta(props.item.covered_episodes, props.item.coverage_pending)}>
          {(meta) => <div class="mt-1 text-[11px] text-muted-foreground">{meta()}</div>}
        </Show>
      </TableCell>
      <Show
        when={!props.isHistory}
        fallback={
          <TableCell class="text-muted-foreground text-sm whitespace-nowrap hidden md:table-cell">
            {dateStr ? new Date(dateStr).toLocaleString() : "-"}
          </TableCell>
        }
      >
        <TableCell class="py-2 min-w-[140px] md:min-w-[180px]">
          <Show
            when={
              props.item.status?.toLowerCase() === "downloading" &&
              props.item.progress !== undefined
            }
            fallback={<span class="text-muted-foreground text-sm">-</span>}
          >
            <div class="flex items-center gap-2">
              <Progress value={props.item.progress ?? 0} class="h-1.5 w-full bg-muted" />
              <span class="text-xs font-mono text-muted-foreground w-8 text-right">
                {Math.round(props.item.progress ?? 0)}%
              </span>
            </div>
          </Show>
        </TableCell>
      </Show>
      <TableCell class="py-2">
        <div class="flex items-center gap-2">
          <span class="capitalize text-sm text-muted-foreground">{statusPresentation().label}</span>
        </div>
      </TableCell>
      <TableCell class="text-right py-2 pr-4">
        <div class="flex items-center justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <DownloadEventsDialog
            description="Timeline of queue, status, retry, and import events for this historical download."
            downloadId={props.item.id}
            formatTimestamp={(value) => new Date(value).toLocaleString()}
            title={`Download Events - ${props.item.anime_title}`}
            triggerLabel="View download events"
          />
          <Show
            when={props.item.status?.toLowerCase() === "completed" && !props.item.reconciled_at}
          >
            <Button
              variant="ghost"
              size="icon"
              class="relative after:absolute after:-inset-2 h-7 w-7"
              aria-label="Mark as reconciled"
              onClick={handleReconcile}
              disabled={reconcileDownload.isPending}
            >
              <IconCheck class="h-4 w-4" />
            </Button>
          </Show>
          <Show
            when={
              props.item.status?.toLowerCase() === "failed" ||
              props.item.status?.toLowerCase() === "error"
            }
          >
            <Button
              variant="ghost"
              size="icon"
              class="relative after:absolute after:-inset-2 h-7 w-7"
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
            class="relative after:absolute after:-inset-2 h-7 w-7"
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
