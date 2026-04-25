import type { ReactNode } from "react";
import { FilterContext } from "./filter-context";
import type { FilterColumnConfig, FilterContextValue, FilterOperator, FilterState } from "./types";

interface FilterProviderProps {
  children: ReactNode;
  columns: FilterColumnConfig[];
  value: FilterState[];
  onChange: (filters: FilterState[]) => void;
}

function FilterContextProvider(props: { value: FilterContextValue; children: ReactNode }) {
  return <FilterContext.Provider value={props.value}>{props.children}</FilterContext.Provider>;
}

export function FilterProvider(props: FilterProviderProps) {
  const columns = props.columns;
  const filters = props.value;

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

    props.onChange([...props.value, newFilter]);
  };

  const updateFilter = (id: string, updates: Partial<FilterState>) => {
    const newFilters = [...props.value];
    const existingIndex = newFilters.findIndex((filter) => filter.id === id);
    const existing = existingIndex >= 0 ? newFilters[existingIndex] : undefined;
    if (!existing) {
      return;
    }

    newFilters[existingIndex] = { ...existing, ...updates };
    props.onChange(newFilters);
  };

  const removeFilter = (id: string) => {
    props.onChange(props.value.filter((filter) => filter.id !== id));
  };

  const clearAllFilters = () => {
    props.onChange([]);
  };

  const contextValue: FilterContextValue = {
    columns,
    filters,
    addFilter,
    updateFilter,
    removeFilter,
    clearAllFilters,
  };

  return <FilterContextProvider value={contextValue}>{props.children}</FilterContextProvider>;
}
