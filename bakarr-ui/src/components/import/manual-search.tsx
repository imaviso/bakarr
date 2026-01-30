import {
	IconAlertTriangle,
	IconLoader2,
	IconPlus,
	IconSearch,
} from "@tabler/icons-solidjs";
import { createEffect, createSignal, For, Show } from "solid-js";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { createAnimeSearchQuery } from "~/lib/api";
import { cn } from "~/lib/utils";
import type { ManualSearchProps } from "./types";

export function ManualSearch(props: ManualSearchProps) {
	const [query, setQuery] = createSignal("");
	const [debouncedQuery, setDebouncedQuery] = createSignal("");

	createEffect(() => {
		const timeout = setTimeout(() => setDebouncedQuery(query()), 500);
		return () => clearTimeout(timeout);
	});

	const search = createAnimeSearchQuery(debouncedQuery);

	return (
		<div class="space-y-4">
			<div class="relative">
				<IconSearch class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
				<TextField value={query()} onChange={setQuery}>
					<TextFieldInput
						placeholder="Search for anime..."
						class="pl-9"
						autofocus
					/>
				</TextField>
				<Show when={search.isFetching}>
					<IconLoader2 class="absolute right-3 top-3 h-3 w-3 animate-spin text-muted-foreground" />
				</Show>
			</div>

			<div class="h-[300px] border rounded-md overflow-y-auto">
				<Show
					when={debouncedQuery()}
					fallback={
						<div class="h-full flex flex-col items-center justify-center text-muted-foreground">
							<IconSearch class="h-8 w-8 mb-2 opacity-20" />
							<p class="text-sm">Type to search for anime</p>
						</div>
					}
				>
					<Show
						when={search.data?.length !== 0}
						fallback={
							<div class="h-full flex flex-col items-center justify-center text-muted-foreground">
								<IconAlertTriangle class="h-8 w-8 mb-2 opacity-20" />
								<p class="text-sm">No results found</p>
							</div>
						}
					>
						<div class="divide-y">
							<For each={search.data}>
								{(anime) => {
									const isAdded = () => props.existingIds.has(anime.id);
									return (
										<button
											type="button"
											disabled={isAdded()}
											onClick={() => props.onSelect(anime)}
											class={cn(
												"w-full flex items-center gap-3 p-3 text-left transition-colors",
												isAdded()
													? "opacity-50 cursor-not-allowed bg-muted/20"
													: "hover:bg-muted/50",
											)}
										>
											<div class="h-10 w-10 shrink-0 rounded bg-muted overflow-hidden">
												<Show when={anime.cover_image}>
													<img
														src={anime.cover_image}
														alt=""
														class="h-full w-full object-cover"
													/>
												</Show>
											</div>
											<div class="flex-1 min-w-0">
												<p class="text-sm font-medium truncate">
													{anime.title.romaji}
												</p>
												<p class="text-xs text-muted-foreground truncate">
													{anime.title.english}
												</p>
											</div>
											<Show
												when={isAdded()}
												fallback={
													<IconPlus class="h-4 w-4 text-muted-foreground" />
												}
											>
												<span class="text-xs text-muted-foreground">Added</span>
											</Show>
										</button>
									);
								}}
							</For>
						</div>
					</Show>
				</Show>
			</div>
		</div>
	);
}
