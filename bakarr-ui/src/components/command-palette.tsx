import {
	IconChevronRight,
	IconCommand,
	IconExternalLink,
	IconSearch,
} from "@tabler/icons-solidjs";
import { useNavigate } from "@tanstack/solid-router";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	Show,
	Suspense,
} from "solid-js";
import { AddAnimeDialog } from "~/components/add-anime-dialog";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "~/components/ui/command";
import { Skeleton } from "~/components/ui/skeleton";
import {
	type AnimeSearchResult,
	createAnimeListQuery,
	createAnimeSearchQuery,
} from "~/lib/api";

// Separate component for the search results to isolate re-renders
function SearchResults(props: {
	inputValue: () => string;
	debouncedSearch: () => string;
	animeList: ReturnType<typeof createAnimeListQuery>;
	anilistSearch: ReturnType<typeof createAnimeSearchQuery>;
	onSelect: (path: string) => void;
	onAddAnime: (anime: AnimeSearchResult) => void;
}) {
	// Filter library anime based on search - uses input value for instant feedback
	const filteredLibrary = createMemo(() => {
		const query = props.inputValue().toLowerCase().trim();
		const data = props.animeList.data;

		if (!data) return [];
		if (!query) return data.slice(0, 10);

		return data.filter((anime) => {
			const title = anime.title.romaji?.toLowerCase() || "";
			const english = anime.title.english?.toLowerCase() || "";
			const native = anime.title.native?.toLowerCase() || "";
			return (
				title.includes(query) ||
				english.includes(query) ||
				native.includes(query)
			);
		}).slice(0, 10);
	});

	return (
		<CommandList>
			<Suspense
				fallback={
					<CommandEmpty>
						<div class="flex items-center justify-center py-4">
							<Skeleton class="h-4 w-32" />
						</div>
					</CommandEmpty>
				}
			>
				{/* Show loading state */}
				<Show when={props.animeList.isLoading}>
					<CommandEmpty>Loading library...</CommandEmpty>
				</Show>

				{/* Show no results when library is empty */}
				<Show
					when={
						!props.animeList.isLoading && filteredLibrary().length === 0
					}
				>
					<CommandEmpty>
						<Show
							when={
								props.debouncedSearch().length >= 3 &&
								!props.anilistSearch.isLoading
							}
						>
							No results in library. Check AniList results below.
						</Show>
						<Show when={props.debouncedSearch().length < 3}>
							No anime found in library.
						</Show>
						<Show when={props.anilistSearch.isLoading}>
							Searching AniList...
						</Show>
					</CommandEmpty>
				</Show>

				{/* Library Section */}
				<Show
					when={
						!props.animeList.isLoading && filteredLibrary().length > 0
					}
				>
					<CommandGroup heading="Library">
						<For each={filteredLibrary()}>
							{(anime) => (
								<CommandItem
									value={`library-${anime.id}`}
									onSelect={() => props.onSelect(`/anime/${anime.id}`)}
								>
									<Show when={anime.cover_image}>
										<img
											src={anime.cover_image}
											alt=""
											class="mr-2 h-8 w-6 object-cover rounded"
										/>
									</Show>
									<div class="flex flex-col">
										<span class="font-medium">
											{anime.title.romaji}
										</span>
										<Show
											when={
												anime.title.english &&
												anime.title.english !==
													anime.title.romaji
											}
										>
											<span class="text-xs text-muted-foreground">
												{anime.title.english}
											</span>
										</Show>
									</div>
									<IconChevronRight class="ml-auto h-4 w-4 text-muted-foreground" />
								</CommandItem>
							)}
						</For>
					</CommandGroup>
				</Show>

				{/* AniList Search Section - for adding new anime */}
				<Show
					when={
						props.debouncedSearch().length >= 3 &&
						props.anilistSearch.data &&
						props.anilistSearch.data.length > 0
					}
				>
					<CommandSeparator />
					<CommandGroup heading="AniList - Add New Anime">
						<For
							each={props.anilistSearch.data
								?.filter((a) => !a.already_in_library)
								.slice(0, 5)}
						>
							{(anime) => (
								<CommandItem
									value={`anilist-${anime.id}`}
									onSelect={() => props.onAddAnime(anime)}
								>
									<Show when={anime.cover_image}>
										<img
											src={anime.cover_image}
											alt=""
											class="mr-2 h-8 w-6 object-cover rounded"
										/>
									</Show>
									<div class="flex flex-col">
										<span class="font-medium">
											{anime.title.romaji}
										</span>
										<Show
											when={
												anime.title.english &&
												anime.title.english !==
													anime.title.romaji
											}
										>
											<span class="text-xs text-muted-foreground">
												{anime.title.english}
											</span>
										</Show>
									</div>
									<IconExternalLink class="ml-auto h-4 w-4 text-muted-foreground" />
								</CommandItem>
							)}
						</For>
					</CommandGroup>
				</Show>
			</Suspense>
		</CommandList>
	);
}

export function CommandPalette() {
	const [open, setOpen] = createSignal(false);
	const [inputValue, setInputValue] = createSignal("");
	const [debouncedSearch, setDebouncedSearch] = createSignal("");
	const [selectedAnimeForAdd, setSelectedAnimeForAdd] =
		createSignal<AnimeSearchResult | null>(null);
	const navigate = useNavigate();

	// Keyboard shortcut to open command palette
	createEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
	});

	// Debounce search input to prevent excessive re-renders
	createEffect(() => {
		const value = inputValue();
		const timeout = setTimeout(() => {
			setDebouncedSearch(value);
		}, 150);
		return () => clearTimeout(timeout);
	});

	// Fetch library anime - fetch once and don't track updates while dialog is open
	const animeList = createAnimeListQuery();

	// Fetch AniList search for adding new anime - uses debounced value
	const anilistSearch = createAnimeSearchQuery(() => debouncedSearch());

	const handleSelect = (path: string) => {
		setOpen(false);
		navigate({ to: path });
	};

	const handleAddAnime = (anime: AnimeSearchResult) => {
		setSelectedAnimeForAdd(anime);
	};

	const handleAddSuccess = () => {
		setSelectedAnimeForAdd(null);
		setOpen(false);
	};

	return (
		<>
			{/* Search Button in Header - Static, never re-renders */}
			<button
				type="button"
				onClick={() => setOpen(true)}
				class="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
			>
				<IconSearch class="h-4 w-4 shrink-0" />
				<span class="hidden md:inline">Search...</span>
				<kbd class="pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
					<IconCommand class="h-2.5 w-2.5" />K
				</kbd>
			</button>

			{/* Dialog with isolated rendering */}
			<CommandDialog open={open()} onOpenChange={setOpen}>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search library or add anime..."
						value={inputValue()}
						onValueChange={setInputValue}
						class="focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 border-0"
					/>
					<SearchResults
						inputValue={inputValue}
						debouncedSearch={debouncedSearch}
						animeList={animeList}
						anilistSearch={anilistSearch}
						onSelect={handleSelect}
						onAddAnime={handleAddAnime}
					/>
				</Command>
			</CommandDialog>

			{/* Add Anime Dialog - opens inline without navigating */}
			<Show when={selectedAnimeForAdd()}>
				<AddAnimeDialog
					// biome-ignore lint/style/noNonNullAssertion: Guarded by Show
					anime={selectedAnimeForAdd()!}
					open={!!selectedAnimeForAdd()}
					onOpenChange={(open) => !open && setSelectedAnimeForAdd(null)}
					onSuccess={handleAddSuccess}
				/>
			</Show>
		</>
	);
}
