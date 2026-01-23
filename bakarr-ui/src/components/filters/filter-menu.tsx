import { IconPlus } from "@tabler/icons-solidjs";
import { For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useFilterContext } from "./filter-context";

export function FilterMenu() {
	const ctx = useFilterContext();

	const availableColumns = () =>
		ctx.columns.filter(
			(col) => !ctx.filters().some((f) => f.columnId === col.id),
		);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				as={Button}
				variant="outline"
				size="sm"
				disabled={availableColumns().length === 0}
			>
				<IconPlus class="h-4 w-4 mr-2" />
				Add Filter
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				<For each={availableColumns()}>
					{(column) => (
						<DropdownMenuItem onClick={() => ctx.addFilter(column.id)}>
							<Show when={column.icon}>
								<span class="mr-2">{column.icon}</span>
							</Show>
							{column.label}
						</DropdownMenuItem>
					)}
				</For>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
