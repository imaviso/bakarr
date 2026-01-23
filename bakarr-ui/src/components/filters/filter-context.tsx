import { createContext, useContext } from "solid-js";
import type { FilterContextValue } from "./types";

const FilterContext = createContext<FilterContextValue>();

export function useFilterContext() {
	const context = useContext(FilterContext);
	if (!context) {
		throw new Error("useFilterContext must be used within FilterProvider");
	}
	return context;
}

export { FilterContext };
