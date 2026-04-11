import type { Accessor } from "solid-js";
import type {
  Download,
  DownloadEvent,
  DownloadEventsExportResult,
  DownloadStatus,
} from "~/lib/api";
import type { DownloadEventsFilterValue } from "~/components/download-events/download-events-filters";

export interface DownloadsEventsSearchState {
  activePreset: Accessor<number | null | undefined>;
  applyDateRangePreset: (hours: number) => void;
  exportInput: Accessor<{
    animeId?: number;
    downloadId?: number;
    endDate?: string;
    eventType?: string;
    limit?: number;
    order?: "asc" | "desc";
    startDate?: string;
    status?: string;
  }>;
  filterValue: Accessor<DownloadEventsFilterValue>;
  queryInput: Accessor<{
    animeId?: number;
    cursor?: string;
    direction?: "next" | "prev";
    downloadId?: number;
    endDate?: string;
    eventType?: string;
    limit?: number;
    startDate?: string;
    status?: string;
  }>;
  resetFilters: () => void;
  updateFilter: (field: keyof DownloadEventsFilterValue, value: string) => void;
}

export interface DownloadsEventsQuery {
  data:
    | {
        events: DownloadEvent[];
        has_more?: boolean;
        next_cursor?: string | undefined;
        prev_cursor?: string | undefined;
        total?: number;
      }
    | undefined;
  isLoading: boolean;
}

export interface DownloadsHistoryQuery {
  isLoading: boolean;
}

export interface DownloadsMutationLike {
  isPending: boolean;
}

export interface DownloadsViewState {
  canGoToNextEventsPage: Accessor<boolean>;
  canGoToPreviousEventsPage: Accessor<boolean>;
  downloadEventsQuery: DownloadsEventsQuery;
  eventsSearchState: DownloadsEventsSearchState;
  goToNextEventsPage: () => void;
  goToPreviousEventsPage: () => void;
  handleDownloadEventsExport: (format: "json" | "csv") => void;
  handleTabChange: (value: string | undefined) => void;
  history: Accessor<Download[]>;
  historyQuery: DownloadsHistoryQuery;
  lastDownloadEventsExport: Accessor<DownloadEventsExportResult | undefined>;
  queue: DownloadStatus[];
  queueCount: Accessor<number>;
  searchMissing: DownloadsMutationLike;
  searchMissingWithToast: () => unknown;
  syncDownloads: DownloadsMutationLike;
  syncDownloadsWithToast: () => unknown;
}
