import { useCallback, useMemo, type ReactNode } from "react";
import { FilterContext } from "./filter-context";
import type { FilterColumnConfig, FilterContextValue, FilterOperator, FilterState } from "./types";

interface FilterProviderProps {
  children: ReactNode;
  /** Caller should memoize this array; `addFilter` dep on `columns` recreates otherwise. */
  columns: FilterColumnConfig[];
  value: FilterState[];
  onChange: (filters: FilterState[]) => void;
}

function FilterContextProvider(props: { value: FilterContextValue; children: ReactNode }) {
  return <FilterContext.Provider value={props.value}>{props.children}</FilterContext.Provider>;
}

export function FilterProvider(props: FilterProviderProps) {
  const { columns, value: filters, onChange } = props;

  const addFilter = useCallback(
    (columnId: string) => {
      const column = columns.find((c) => c.id === columnId);
      if (!column) return;

      let defaultOperator: FilterOperator =
        column.type === "text"
          ? "contains"
          : column.type === "date" || column.type === "select"
            ? "is"
            : "is_any_of";

      if (column.operators && column.operators.length > 0) {
        if (!column.operators.includes(defaultOperator)) {
          const [firstOperator] = column.operators;
          if (firstOperator) {
            defaultOperator = firstOperator;
          }
        }
      }

      const newFilter: FilterState = {
        id: globalThis.crypto.randomUUID(),
        columnId,
        operator: defaultOperator,
        value: column.type === "multiSelect" ? [] : "",
      };

      onChange([...filters, newFilter]);
    },
    [columns, filters, onChange],
  );

  const updateFilter = useCallback(
    (id: string, updates: Partial<FilterState>) => {
      const newFilters = [...filters];
      const existingIndex = newFilters.findIndex((filter) => filter.id === id);
      const existing = existingIndex >= 0 ? newFilters[existingIndex] : undefined;
      if (!existing) {
        return;
      }

      newFilters[existingIndex] = { ...existing, ...updates };
      onChange(newFilters);
    },
    [filters, onChange],
  );

  const removeFilter = useCallback(
    (id: string) => {
      onChange(filters.filter((filter) => filter.id !== id));
    },
    [filters, onChange],
  );

  const clearAllFilters = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const contextValue = useMemo<FilterContextValue>(
    () => ({
      columns,
      filters,
      addFilter,
      updateFilter,
      removeFilter,
      clearAllFilters,
    }),
    [columns, filters, addFilter, updateFilter, removeFilter, clearAllFilters],
  );

  return <FilterContextProvider value={contextValue}>{props.children}</FilterContextProvider>;
}
