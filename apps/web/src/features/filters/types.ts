import type { ReactNode } from "react";

export type FilterOperator =
  | "is"
  | "is_not"
  | "contains"
  | "does_not_contain"
  | "is_any_of"
  | "is_none_of"
  | "is_before"
  | "is_after"
  | "is_between";

export type FilterType = "text" | "select" | "multiSelect" | "date";

export interface FilterOption {
  label: string;
  value: string;
  icon?: ReactNode;
  count?: number;
}

export interface FilterColumnConfig {
  id: string;
  label: string;
  type: FilterType;
  icon?: ReactNode;
  options?: FilterOption[];
  placeholder?: string;
  operators?: FilterOperator[];
}

export interface FilterState {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value: string | string[];
}

export interface FilterContextValue {
  columns: FilterColumnConfig[];
  filters: FilterState[];
  addFilter: (columnId: string) => void;
  updateFilter: (id: string, updates: Partial<FilterState>) => void;
  removeFilter: (id: string) => void;
  clearAllFilters: () => void;
}
