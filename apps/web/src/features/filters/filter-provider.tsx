import { useMemo, type ReactNode } from "react";
import { FilterContext } from "./filter-context";
import type { FilterColumnConfig, FilterContextValue, FilterOperator, FilterState } from "./types";

interface FilterProviderProps {
  children: ReactNode;
  value: FilterState[];
  onChange: (filters: FilterState[]) => void;
  columns: FilterColumnConfig[];
}

export function FilterProvider(props: FilterProviderProps) {
  const { columns, value: filters, onChange } = props;

  const contextValue = useMemo<FilterContextValue>(() => {
    const addFilter = (columnId: string) => {
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
    };

    return {
      columns,
      filters,
      addFilter,
      updateFilter: (id: string, updates: Partial<FilterState>) => {
        const newFilters = [...filters];
        const existingIndex = newFilters.findIndex((filter) => filter.id === id);
        const existing = existingIndex >= 0 ? newFilters[existingIndex] : undefined;
        if (!existing) {
          return;
        }

        newFilters[existingIndex] = { ...existing, ...updates };
        onChange(newFilters);
      },
      removeFilter: (id: string) => {
        onChange(filters.filter((filter) => filter.id !== id));
      },
      clearAllFilters: () => onChange([]),
    };
  }, [columns, filters, onChange]);

  return <FilterContext.Provider value={contextValue}>{props.children}</FilterContext.Provider>;
}
