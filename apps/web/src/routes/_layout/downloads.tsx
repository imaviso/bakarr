import { IconRefresh, IconSearch } from "@tabler/icons-solidjs";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { toast } from "solid-sonner";
import * as v from "valibot";
import { ActiveDownloadRow, DownloadRow } from "~/components/downloads/download-rows";
import {
  DownloadEventsFilters,
  type DownloadEventsFilterValue,
} from "~/components/download-events/download-events-filters";
import { GeneralError } from "~/components/general-error";
import { DownloadEventCard } from "~/components/download-event-card";
import { PageHeader } from "~/components/page-header";
import { DownloadEventsDialog } from "~/components/download-events-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
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
  createDownloadEventsQuery,
  createDownloadHistoryQuery,
  createSearchMissingMutation,
  createSyncDownloadsMutation,
  type DownloadEventsExportResult,
  downloadHistoryQueryOptions,
} from "~/lib/api";
import { buildDownloadEventsFilterInput } from "~/lib/download-events-filters";
import { formatDateTimeLocalInput, getDateRangePresetHours } from "~/lib/date-presets";
import {
  buildDownloadEventsExportInput,
  runDownloadEventsExport,
} from "~/lib/download-events-export";

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

export const Route = createFileRoute("/_layout/downloads")({
  validateSearch: (search) => v.parse(DownloadsSearchSchema, search),
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(downloadHistoryQueryOptions());
  },
  component: DownloadsPage,
  errorComponent: GeneralError,
});

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
  const downloadEventsQuery = createDownloadEventsQuery(() =>
    buildDownloadEventsFilterInput({
      animeId: search().events_anime_id,
      cursor: search().events_cursor,
      direction: search().events_direction,
      downloadId: search().events_download_id,
      endDate: search().events_end_date,
      eventType: search().events_event_type,
      startDate: search().events_start_date,
      status: search().events_status,
    }),
  );
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
    const [first] = items;
    return first ? first.start : 0;
  });
  const queuePaddingBottom = createMemo(() => {
    const items = queueVirtualizer.getVirtualItems();
    const last = items[items.length - 1];
    return last ? queueVirtualizer.getTotalSize() - last.end : 0;
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
    const [first] = items;
    return first ? first.start : 0;
  });
  const historyPaddingBottom = createMemo(() => {
    const items = historyVirtualizer.getVirtualItems();
    const last = items[items.length - 1];
    return last ? historyVirtualizer.getTotalSize() - last.end : 0;
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
    void runDownloadEventsExport({
      format,
      input: buildDownloadEventsExportInput({
        animeId: search().events_anime_id,
        downloadId: search().events_download_id,
        endDate: search().events_end_date,
        eventType: search().events_event_type,
        startDate: search().events_start_date,
        status: search().events_status,
      }),
      onComplete: (result) => {
        setLastDownloadEventsExport(result);
      },
    });
  };

  const eventsFilterValue = createMemo<DownloadEventsFilterValue>(() => ({
    animeId: search().events_anime_id,
    downloadId: search().events_download_id,
    endDate: search().events_end_date,
    eventType: search().events_event_type,
    startDate: search().events_start_date,
    status: search().events_status,
  }));

  const updateEventsFilter = (field: keyof DownloadEventsFilterValue, value: string) => {
    const patch: Partial<ReturnType<typeof search>> = {
      events_cursor: "",
      events_direction: "next",
    };

    if (field === "animeId") {
      patch.events_anime_id = value;
    } else if (field === "downloadId") {
      patch.events_download_id = value;
    } else if (field === "endDate") {
      patch.events_end_date = value;
    } else if (field === "eventType") {
      patch.events_event_type = value;
    } else if (field === "startDate") {
      patch.events_start_date = value;
    } else {
      patch.events_status = value;
    }

    updateSearch(patch);
  };

  const clearEventsFilters = () => {
    updateSearch({
      events_anime_id: "",
      events_cursor: "",
      events_direction: "next",
      events_download_id: "",
      events_end_date: "",
      events_event_type: "all",
      events_start_date: "",
      events_status: "",
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
              <DownloadEventsFilters
                eventTypeSelectId="events-event-type"
                value={eventsFilterValue()}
                onFieldChange={updateEventsFilter}
                onApplyPreset={applyEventsDateRangePreset}
                activePreset={activeEventsPreset()}
                onClear={clearEventsFilters}
                onExport={handleDownloadEventsExport}
              />
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
