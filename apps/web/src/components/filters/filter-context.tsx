import { createContext, useContext } from "react";
import type { FilterContextValue } from "./types";

const FilterContext = createContext<FilterContextValue | undefined>(undefined);

export function useFilterContext() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilterContext must be used within FilterProvider");
  }
  return context;
}

export { FilterContext };
