import type { JSX } from "solid-js";

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
	icon?: JSX.Element;
	count?: number;
}

export interface FilterColumnConfig {
	id: string;
	label: string;
	type: FilterType;
	icon?: JSX.Element;
	options?: FilterOption[];
	placeholder?: string;
	operators?: FilterOperator[];
}

export interface FilterState {
	columnId: string;
	operator: FilterOperator;
	value: string | string[];
}

export interface FilterContextValue {
	columns: FilterColumnConfig[];
	filters: () => FilterState[];
	addFilter: (columnId: string) => void;
	updateFilter: (index: number, updates: Partial<FilterState>) => void;
	removeFilter: (index: number) => void;
	clearAllFilters: () => void;
}
