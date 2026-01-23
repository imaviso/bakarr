import type { JSX } from "solid-js";
import { createMemo } from "solid-js";
import { FilterContext } from "./filter-context";
import type {
	FilterColumnConfig,
	FilterContextValue,
	FilterOperator,
	FilterState,
} from "./types";

interface FilterProviderProps {
	children: JSX.Element;
	columns: FilterColumnConfig[];
	value: FilterState[];
	onChange: (filters: FilterState[]) => void;
}

export function FilterProvider(props: FilterProviderProps) {
	const filters = createMemo(() => props.value);

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
				defaultOperator = column.operators[0];
			}
		}

		const newFilter: FilterState = {
			columnId,
			operator: defaultOperator,
			value: column.type === "multiSelect" ? [] : "",
		};

		props.onChange([...props.value, newFilter]);
	};

	const updateFilter = (index: number, updates: Partial<FilterState>) => {
		const newFilters = [...props.value];
		newFilters[index] = { ...newFilters[index], ...updates };
		props.onChange(newFilters);
	};

	const removeFilter = (index: number) => {
		props.onChange(props.value.filter((_, i) => i !== index));
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

	return (
		<FilterContext.Provider value={contextValue}>
			{props.children}
		</FilterContext.Provider>
	);
}
