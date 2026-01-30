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
} from "solid-js";
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
import { createAnimeListQuery, createAnimeSearchQuery } from "~/lib/api";

export function CommandPalette() {
	const [open, setOpen] = createSignal(false);
	const [search, setSearch] = createSignal("");
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

	// Fetch library anime
	const animeList = createAnimeListQuery();

	// Fetch AniList search for adding new anime
	const anilistSearch = createAnimeSearchQuery(() => search());

	// Filter library anime based on search
	const filteredLibrary = createMemo(() => {
		const query = search().toLowerCase().trim();
		const data = animeList.data;
		
		if (!data) return [];
		if (!query) return data;

		return data.filter((anime) => {
			const title = anime.title.romaji?.toLowerCase() || "";
			const english = anime.title.english?.toLowerCase() || "";
			const native = anime.title.native?.toLowerCase() || "";
			return (
				title.includes(query) ||
				english.includes(query) ||
				native.includes(query)
			);
		});
	});

	const handleSelect = (path: string) => {
		setOpen(false);
		navigate({ to: path });
	};

	const handleAddAnime = (id: number) => {
		setOpen(false);
		navigate({ to: "/anime/add", search: { id: id.toString() } });
	};

	return (
		<>
			{/* Search Button in Header */}
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

			<CommandDialog open={open()} onOpenChange={setOpen}>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search library or add anime..."
						value={search()}
						onValueChange={setSearch}
						class="focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 border-0"
					/>
					<CommandList>
						{/* Show loading state */}
						<Show when={animeList.isLoading}>
							<CommandEmpty>Loading library...</CommandEmpty>
						</Show>

						{/* Show no results when library is empty */}
						<Show when={!animeList.isLoading && filteredLibrary().length === 0}>
							<CommandEmpty>
								<Show when={search().length >= 3 && !anilistSearch.isLoading}>
									No results in library. Check AniList results below.
								</Show>
								<Show when={search().length < 3}>
									No anime found in library.
								</Show>
								<Show when={anilistSearch.isLoading}>Searching AniList...</Show>
							</CommandEmpty>
						</Show>

						{/* Library Section */}
						<Show when={!animeList.isLoading && filteredLibrary().length > 0}>
							<CommandGroup heading="Library">
								<For each={filteredLibrary().slice(0, 10)}>
									{(anime) => (
										<CommandItem
											value={`library-${anime.id}-${anime.title.romaji}`}
											onSelect={() => handleSelect(`/anime/${anime.id}`)}
										>
											<Show when={anime.cover_image}>
												<img
													src={anime.cover_image}
													alt=""
													class="mr-2 h-8 w-6 object-cover rounded"
												/>
											</Show>
											<div class="flex flex-col">
												<span class="font-medium">{anime.title.romaji}</span>
												<Show
													when={
														anime.title.english &&
														anime.title.english !== anime.title.romaji
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
								search().length >= 3 &&
								anilistSearch.data &&
								anilistSearch.data.length > 0
							}
						>
							<CommandSeparator />
							<CommandGroup heading="AniList - Add New Anime">
								<For
									each={anilistSearch.data
										?.filter((a) => !a.already_in_library)
										.slice(0, 5)}
								>
									{(anime) => (
										<CommandItem
											value={`anilist-${anime.id}-${anime.title.romaji}`}
											onSelect={() => handleAddAnime(anime.id)}
										>
											<Show when={anime.cover_image}>
												<img
													src={anime.cover_image}
													alt=""
													class="mr-2 h-8 w-6 object-cover rounded"
												/>
											</Show>
											<div class="flex flex-col">
												<span class="font-medium">{anime.title.romaji}</span>
												<Show
													when={
														anime.title.english &&
														anime.title.english !== anime.title.romaji
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
					</CommandList>
				</Command>
			</CommandDialog>
		</>
	);
}
