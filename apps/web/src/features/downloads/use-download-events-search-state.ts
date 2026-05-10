import type { DownloadEventsFilterValue } from "~/features/downloads/download-events/download-events-filters";
import { formatDateTimeLocalInput, getDateRangePresetHours } from "~/domain/date-presets";
import type { DownloadEventsSearchKeys } from "~/domain/download/events-search";
import { createDownloadEventsSearchDefaults } from "~/domain/download/events-search";
import {
  buildDownloadEventsExportInput,
  buildDownloadEventsFilterInput,
} from "~/domain/download/events-query-model";

interface UseDownloadEventsSearchStateOptions {
  keys: DownloadEventsSearchKeys;
  search: Record<string, string | undefined>;
  updateSearch: (patch: Partial<Record<string, string | undefined>>) => void;
}

export function useDownloadEventsSearchState(options: UseDownloadEventsSearchStateOptions) {
  const read = (key: string): string => options.search[key] ?? "";

  const patchWithCursorReset = (patch: Partial<Record<string, string | undefined>>) => ({
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

  const filterValue: DownloadEventsFilterValue = {
    animeId: read(options.keys.animeId),
    downloadId: read(options.keys.downloadId),
    endDate: read(options.keys.endDate),
    eventType: read(options.keys.eventType),
    startDate: read(options.keys.startDate),
    status: read(options.keys.status),
  };

  const queryInput = buildDownloadEventsFilterInput({
    animeId: read(options.keys.animeId),
    cursor: read(options.keys.cursor),
    direction: read(options.keys.direction) === "prev" ? "prev" : "next",
    downloadId: read(options.keys.downloadId),
    endDate: read(options.keys.endDate),
    eventType: read(options.keys.eventType),
    startDate: read(options.keys.startDate),
    status: read(options.keys.status),
  });

  const exportInput = buildDownloadEventsExportInput({
    animeId: read(options.keys.animeId),
    downloadId: read(options.keys.downloadId),
    endDate: read(options.keys.endDate),
    eventType: read(options.keys.eventType),
    startDate: read(options.keys.startDate),
    status: read(options.keys.status),
  });

  const activePreset = getDateRangePresetHours(
    read(options.keys.startDate),
    read(options.keys.endDate),
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
    options.updateSearch(createDownloadEventsSearchDefaults(options.keys));
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
