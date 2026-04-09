import type { Accessor } from "solid-js";
import { createMemo } from "solid-js";
import type { DownloadEventsFilterValue } from "~/components/download-events/download-events-filters";
import { formatDateTimeLocalInput, getDateRangePresetHours } from "~/lib/date-presets";
import { buildDownloadEventsExportInput } from "~/lib/download-events-export";
import { buildDownloadEventsFilterInput } from "~/lib/download-events-filters";

interface DownloadEventsSearchKeys<TSearch extends Record<string, unknown>> {
  animeId: keyof TSearch;
  cursor: keyof TSearch;
  direction: keyof TSearch;
  downloadId: keyof TSearch;
  endDate: keyof TSearch;
  eventType: keyof TSearch;
  startDate: keyof TSearch;
  status: keyof TSearch;
}

interface UseDownloadEventsSearchStateOptions<TSearch extends Record<string, unknown>> {
  keys: DownloadEventsSearchKeys<TSearch>;
  search: Accessor<TSearch>;
  updateSearch: (patch: Partial<TSearch>) => void;
}

export function useDownloadEventsSearchState<TSearch extends Record<string, unknown>>(
  options: UseDownloadEventsSearchStateOptions<TSearch>,
) {
  const read = (key: keyof TSearch): string => {
    const value = options.search()[key];
    return typeof value === "string" ? value : "";
  };

  const readDirection = (key: keyof TSearch): "next" | "prev" =>
    read(key) === "prev" ? "prev" : "next";

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    options.updateSearch({
      [options.keys.cursor]: "",
      [options.keys.direction]: "next",
      [options.keys.endDate]: formatDateTimeLocalInput(end),
      [options.keys.startDate]: formatDateTimeLocalInput(start),
    } as Partial<TSearch>);
  };

  const updateFilter = (field: keyof DownloadEventsFilterValue, value: string) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const patch = {
      [options.keys.cursor]: "",
      [options.keys.direction]: "next",
    } as Partial<TSearch>;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const typedValue = value as TSearch[keyof TSearch];

    if (field === "animeId") {
      patch[options.keys.animeId] = typedValue;
    } else if (field === "downloadId") {
      patch[options.keys.downloadId] = typedValue;
    } else if (field === "endDate") {
      patch[options.keys.endDate] = typedValue;
    } else if (field === "eventType") {
      patch[options.keys.eventType] = typedValue;
    } else if (field === "startDate") {
      patch[options.keys.startDate] = typedValue;
    } else {
      patch[options.keys.status] = typedValue;
    }

    options.updateSearch(patch);
  };

  const resetFilters = () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    options.updateSearch({
      [options.keys.animeId]: "",
      [options.keys.cursor]: "",
      [options.keys.direction]: "next",
      [options.keys.downloadId]: "",
      [options.keys.endDate]: "",
      [options.keys.eventType]: "all",
      [options.keys.startDate]: "",
      [options.keys.status]: "",
    } as Partial<TSearch>);
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
