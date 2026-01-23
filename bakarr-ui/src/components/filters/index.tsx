import type { JSX } from "solid-js";
import { FilterActions } from "./filter-actions";
import { FilterList } from "./filter-list";
import { FilterMenu } from "./filter-menu";
import { FilterProvider } from "./filter-provider";

interface FilterRootProps {
	children: JSX.Element;
}

function FilterRoot(props: FilterRootProps) {
	return <div class="flex flex-col gap-3">{props.children}</div>;
}

export const Filter = {
	Provider: FilterProvider,
	Root: FilterRoot,
	Menu: FilterMenu,
	List: FilterList,
	Actions: FilterActions,
};

export * from "./types";
