import type { Accessor } from "solid-js";
import { createMemo } from "solid-js";
import type { DownloadEventsFilterValue } from "~/components/download-events/download-events-filters";
import { formatDateTimeLocalInput, getDateRangePresetHours } from "~/lib/date-presets";
import { buildDownloadEventsExportInput } from "~/lib/download-events-export";
import { buildDownloadEventsFilterInput } from "~/lib/download-events-filters";

interface DownloadEventsSearchKeys {
  animeId: string;
  cursor: string;
  direction: string;
  downloadId: string;
  endDate: string;
  eventType: string;
  startDate: string;
  status: string;
}

interface UseDownloadEventsSearchStateOptions {
  keys: DownloadEventsSearchKeys;
  search: Accessor<Record<string, string | undefined>>;
  updateSearch: (patch: Partial<Record<string, string>>) => void;
}

export function useDownloadEventsSearchState(options: UseDownloadEventsSearchStateOptions) {
  const read = (key: string): string => options.search()[key] ?? "";

  const readDirection = (key: string): "next" | "prev" => (read(key) === "prev" ? "prev" : "next");

  const patchWithCursorReset = (patch: Partial<Record<string, string>>) => ({
    ...patch,
    [options.keys.cursor]: "",
    [options.keys.direction]: "next",
  });

  const filterKeyByField: Record<keyof DownloadEventsFilterValue, string> = {
    animeId: options.keys.animeId,
    downloadId: options.keys.downloadId,
    endDate: options.keys.endDate,
    eventType: options.keys.eventType,
    startDate: options.keys.startDate,
    status: options.keys.status,
  };

  const filterValue = createMemo<DownloadEventsFilterValue>(() => ({
    animeId: read(options.keys.animeId),
    downloadId: read(options.keys.downloadId),
    endDate: read(options.keys.endDate),
    eventType: read(options.keys.eventType),
    startDate: read(options.keys.startDate),
    status: read(options.keys.status),
  }));

  const queryInput = createMemo(() =>
    buildDownloadEventsFilterInput({
      animeId: read(options.keys.animeId),
      cursor: read(options.keys.cursor),
      direction: readDirection(options.keys.direction),
      downloadId: read(options.keys.downloadId),
      endDate: read(options.keys.endDate),
      eventType: read(options.keys.eventType),
      startDate: read(options.keys.startDate),
      status: read(options.keys.status),
    }),
  );

  const exportInput = createMemo(() =>
    buildDownloadEventsExportInput({
      animeId: read(options.keys.animeId),
      downloadId: read(options.keys.downloadId),
      endDate: read(options.keys.endDate),
      eventType: read(options.keys.eventType),
      startDate: read(options.keys.startDate),
      status: read(options.keys.status),
    }),
  );

  const activePreset = createMemo(() =>
    getDateRangePresetHours(read(options.keys.startDate), read(options.keys.endDate)),
  );

  const applyDateRangePreset = (hours: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);

    options.updateSearch(
      patchWithCursorReset({
        [options.keys.endDate]: formatDateTimeLocalInput(end),
        [options.keys.startDate]: formatDateTimeLocalInput(start),
      }),
    );
  };

  const updateFilter = (field: keyof DownloadEventsFilterValue, value: string) => {
    options.updateSearch(
      patchWithCursorReset({
        [filterKeyByField[field]]: value,
      }),
    );
  };

  const resetFilters = () => {
    options.updateSearch({
      [options.keys.animeId]: "",
      [options.keys.cursor]: "",
      [options.keys.direction]: "next",
      [options.keys.downloadId]: "",
      [options.keys.endDate]: "",
      [options.keys.eventType]: "all",
      [options.keys.startDate]: "",
      [options.keys.status]: "",
    });
  };

  return {
    activePreset,
    applyDateRangePreset,
    exportInput,
    filterValue,
    queryInput,
    resetFilters,
    updateFilter,
  };
}
