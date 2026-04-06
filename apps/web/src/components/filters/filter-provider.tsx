import type { Accessor, JSX } from "solid-js";
import type { Component } from "solid-js";
import { createMemo } from "solid-js";
import { FilterContext } from "./filter-context";
import type { FilterColumnConfig, FilterContextValue, FilterOperator, FilterState } from "./types";

interface FilterProviderProps {
  children: JSX.Element;
  columns: FilterColumnConfig[];
  value: Accessor<FilterState[]>;
  onChange: (filters: FilterState[]) => void;
}

const FilterContextProvider: Component<{ value: FilterContextValue; children: JSX.Element }> = (props) => {
  return <FilterContext.Provider value={props.value}>{props.children}</FilterContext.Provider>;
};

export function FilterProvider(props: FilterProviderProps) {
  const filters = createMemo(() => props.value());

  const addFilter = (columnId: string) => {
    const column = props.columns.find((c) => c.id === columnId);
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
      columnId,
      operator: defaultOperator,
      value: column.type === "multiSelect" ? [] : "",
    };

    props.onChange([...props.value(), newFilter]);
  };

  const updateFilter = (index: number, updates: Partial<FilterState>) => {
    const newFilters = [...props.value()];
    const existing = newFilters[index];
    if (!existing) {
      return;
    }

    newFilters[index] = { ...existing, ...updates };
    props.onChange(newFilters);
  };

  const removeFilter = (index: number) => {
    props.onChange(props.value().filter((_, i) => i !== index));
  };

  const clearAllFilters = () => {
    props.onChange([]);
  };

  const contextValue: FilterContextValue = {
    columns: props.columns,
    filters,
    addFilter,
    updateFilter,
    removeFilter,
    clearAllFilters,
  };

  return <FilterContextProvider value={contextValue}>{props.children}</FilterContextProvider>;
}
