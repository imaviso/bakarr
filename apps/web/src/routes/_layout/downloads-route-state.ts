import { createMemo, createSignal, type Accessor } from "solid-js";
import { toast } from "solid-sonner";
import * as v from "valibot";
import { useDownloadEventsSearchState } from "~/hooks/use-download-events-search-state";
import { useActiveDownloads } from "~/hooks/use-active-downloads";
import {
  createDownloadEventsQuery,
  createDownloadHistoryQuery,
  createSearchMissingMutation,
  createSyncDownloadsMutation,
  type DownloadEventsExportResult,
} from "~/lib/api";
import {
  createDownloadEventsCursorPatch,
  createDownloadEventsSearchDefaults,
  createDownloadEventsSearchSchema,
  DOWNLOADS_EVENTS_SEARCH_KEYS,
} from "~/lib/download-events-search";
import { runDownloadEventsExport } from "~/lib/download-events-export";

export type DownloadsTab = "events" | "history" | "queue";

const downloadsEventsSearchDefaults = createDownloadEventsSearchDefaults(
  DOWNLOADS_EVENTS_SEARCH_KEYS,
);

export const DownloadsSearchSchema = v.object({
  ...createDownloadEventsSearchSchema(DOWNLOADS_EVENTS_SEARCH_KEYS, downloadsEventsSearchDefaults)
    .entries,
  tab: v.optional(v.picklist(["events", "history", "queue"]), "queue"),
});

export const downloadsSearchDefaults = {
  ...createDownloadEventsSearchDefaults(DOWNLOADS_EVENTS_SEARCH_KEYS),
  tab: "queue" as const,
};

export function parseDownloadsSearch(search: Record<string, unknown>) {
  return {
    ...downloadsSearchDefaults,
    ...v.parse(DownloadsSearchSchema, search),
  };
}

export function toDownloadsTab(value: string | null | undefined): DownloadsTab {
  if (value === "events" || value === "history" || value === "queue") {
    return value;
  }

  return "queue";
}

interface UseDownloadsRouteStateOptions {
  search: Accessor<Record<string, string | undefined>>;
  updateSearch: (patch: Partial<Record<string, string>>) => void;
}

export function useDownloadsRouteState(options: UseDownloadsRouteStateOptions) {
  const [lastDownloadEventsExport, setLastDownloadEventsExport] = createSignal<
    DownloadEventsExportResult | undefined
  >(undefined);

  const eventsSearchState = useDownloadEventsSearchState({
    keys: DOWNLOADS_EVENTS_SEARCH_KEYS,
    search: options.search,
    updateSearch: options.updateSearch,
  });

  const queue = useActiveDownloads();
  const historyQuery = createDownloadHistoryQuery();
  const downloadEventsQuery = createDownloadEventsQuery(eventsSearchState.queryInput);
  const searchMissing = createSearchMissingMutation();
  const syncDownloads = createSyncDownloadsMutation();

  const queueCount = createMemo(() => queue.length);
  const history = createMemo(() => historyQuery.data ?? []);

  const handleDownloadEventsExport = (format: "json" | "csv") => {
    void runDownloadEventsExport({
      format,
      input: eventsSearchState.exportInput(),
      onComplete: (result) => {
        setLastDownloadEventsExport(result);
      },
    });
  };

  const goToPreviousEventsPage = () => {
    options.updateSearch(
      createDownloadEventsCursorPatch(
        DOWNLOADS_EVENTS_SEARCH_KEYS,
        "prev",
        downloadEventsQuery.data?.prev_cursor ?? "",
      ),
    );
  };

  const goToNextEventsPage = () => {
    options.updateSearch(
      createDownloadEventsCursorPatch(
        DOWNLOADS_EVENTS_SEARCH_KEYS,
        "next",
        downloadEventsQuery.data?.next_cursor ?? "",
      ),
    );
  };

  const canGoToPreviousEventsPage = createMemo(() =>
    Boolean(downloadEventsQuery.data?.prev_cursor),
  );
  const canGoToNextEventsPage = createMemo(() => Boolean(downloadEventsQuery.data?.next_cursor));

  const syncDownloadsWithToast = () =>
    toast.promise(syncDownloads.mutateAsync(), {
      loading: "Syncing downloads...",
      success: "Download state synced",
      error: (error) => `Failed to sync downloads: ${error.message}`,
    });

  const searchMissingWithToast = () =>
    toast.promise(searchMissing.mutateAsync(undefined), {
      loading: "Triggering global search...",
      success: "Global search triggered in background",
      error: (error) => `Failed to trigger search: ${error.message}`,
    });

  const handleTabChange = (value: string | undefined) => {
    options.updateSearch({ tab: toDownloadsTab(value) });
  };

  return {
    downloadEventsQuery,
    eventsSearchState,
    canGoToNextEventsPage,
    canGoToPreviousEventsPage,
    goToNextEventsPage,
    goToPreviousEventsPage,
    handleDownloadEventsExport,
    handleTabChange,
    history,
    historyQuery,
    lastDownloadEventsExport,
    queue,
    queueCount,
    searchMissing,
    searchMissingWithToast,
    syncDownloads,
    syncDownloadsWithToast,
  };
}
