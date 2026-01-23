import { Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { useFilterContext } from "./filter-context";

export function FilterActions() {
	const ctx = useFilterContext();

	return (
		<Show when={ctx.filters().length > 0}>
			<Button variant="ghost" size="sm" onClick={ctx.clearAllFilters}>
				Clear all
			</Button>
		</Show>
	);
}
