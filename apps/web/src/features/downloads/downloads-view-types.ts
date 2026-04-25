import type {
  Download,
  DownloadEvent,
  DownloadEventsExportResult,
  DownloadStatus,
} from "~/api/contracts";
import type { DownloadEventsFilterValue } from "~/features/downloads/download-events/download-events-filters";

export interface DownloadsEventsSearchState {
  activePreset: number | null | undefined;
  applyDateRangePreset: (hours: number) => void;
  exportInput: {
    animeId?: number;
    downloadId?: number;
    endDate?: string;
    eventType?: string;
    limit?: number;
    order?: "asc" | "desc";
    startDate?: string;
    status?: string;
  };
  filterValue: DownloadEventsFilterValue;
  queryInput: {
    animeId?: number;
    cursor?: string;
    direction?: "next" | "prev";
    downloadId?: number;
    endDate?: string;
    eventType?: string;
    limit?: number;
    startDate?: string;
    status?: string;
  };
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

export interface DownloadsMutationLike {
  isPending: boolean;
}

export interface DownloadsViewState {
  canGoToNextEventsPage: boolean;
  canGoToPreviousEventsPage: boolean;
  downloadEventsQuery: DownloadsEventsQuery;
  eventsSearchState: DownloadsEventsSearchState;
  goToNextEventsPage: () => void;
  goToPreviousEventsPage: () => void;
  handleDownloadEventsExport: (format: "json" | "csv") => void;
  handleTabChange: (value: string | undefined) => void;
  history: Download[];
  lastDownloadEventsExport: DownloadEventsExportResult | undefined;
  queue: DownloadStatus[];
  queueCount: number;
  searchMissing: DownloadsMutationLike;
  triggerSearchMissing: () => void;
  syncDownloads: DownloadsMutationLike;
  triggerSyncDownloads: () => void;
}
