import type { FilterState } from "~/features/filters";
import { parseLogsSearch, type LogsSearchState } from "~/features/logs/logs-search";

interface UseLogsFiltersOptions {
  search: Record<string, string | undefined>;
  updateSearch: (patch: Partial<Record<string, string>>) => void;
}

export interface LogsFilterParams {
  endDate: string | undefined;
  eventType: string | undefined;
  level: string | undefined;
  startDate: string | undefined;
}

function toDateInputValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  const [datePart] = normalized.split(/[T ]/);
  return datePart ?? normalized;
}

function toFilterStates(searchState: LogsSearchState): FilterState[] {
  const next: FilterState[] = [];

  if (searchState.level) {
    next.push({
      id: `level:${searchState.level}`,
      columnId: "level",
      operator: "is",
      value: searchState.level,
    });
  }

  if (searchState.eventType) {
    next.push({
      id: `eventType:${searchState.eventType}`,
      columnId: "eventType",
      operator: "is",
      value: searchState.eventType,
    });
  }

  if (searchState.startDate) {
    next.push({
      id: `startDate:${searchState.startDate}`,
      columnId: "startDate",
      operator: "is_after",
      value: toDateInputValue(searchState.startDate),
    });
  }

  if (searchState.endDate) {
    next.push({
      id: `endDate:${searchState.endDate}`,
      columnId: "endDate",
      operator: "is_before",
      value: toDateInputValue(searchState.endDate),
    });
  }

  return next;
}

export function useLogsFilters(options: UseLogsFiltersOptions) {
  const parsedSearch = parseLogsSearch(options.search as Record<string, unknown>);
  const filterStates = toFilterStates(parsedSearch);

  const logsParams: LogsFilterParams = {
    endDate: parsedSearch.endDate || undefined,
    eventType: parsedSearch.eventType || undefined,
    level: parsedSearch.level || undefined,
    startDate: parsedSearch.startDate || undefined,
  };

  const setFilterStates = (next: FilterState[]) => {
    const patch: Partial<Record<string, string>> = {
      endDate: "",
      eventType: "",
      level: "",
      startDate: "",
    };

    for (const filter of next) {
      const value = Array.isArray(filter.value) ? filter.value[0] : filter.value;
      if (!value) {
        continue;
      }

      if (filter.columnId === "level") {
        patch["level"] = value;
      }

      if (filter.columnId === "eventType") {
        patch["eventType"] = value;
      }

      if (filter.columnId === "startDate") {
        patch["startDate"] = `${value} 00:00:00`;
      }

      if (filter.columnId === "endDate") {
        patch["endDate"] = `${value} 23:59:59`;
      }
    }

    options.updateSearch(patch);
  };

  return {
    filterStates,
    logsParams,
    parsedSearch,
    setFilterStates,
  };
}
