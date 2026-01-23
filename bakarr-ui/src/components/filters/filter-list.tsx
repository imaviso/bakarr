import { For, Show } from "solid-js";
import { useFilterContext } from "./filter-context";
import { FilterItem } from "./filter-item";

export function FilterList() {
	const ctx = useFilterContext();

	return (
		<Show when={ctx.filters().length > 0}>
			<div class="flex flex-wrap gap-2">
				<For each={ctx.filters()}>
					{(filter, index) => <FilterItem filter={filter} index={index()} />}
				</For>
			</div>
		</Show>
	);
}
