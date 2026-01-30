import {
	IconAlertTriangle,
	IconCheck,
	IconFolder,
	IconLoader2,
	IconPlus,
	IconRefresh,
	IconSearch,
} from "@tabler/icons-solidjs";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { GeneralError } from "~/components/general-error";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import {
	type AnimeSearchResult,
	createAnimeSearchQuery,
	createImportUnmappedFolderMutation,
	createScanLibraryMutation,
	createUnmappedFoldersQuery,
	type UnmappedFolder,
	unmappedFoldersQueryOptions,
} from "~/lib/api";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_layout/anime/scan")({
	loader: ({ context: { queryClient } }) => {
		queryClient.ensureQueryData(unmappedFoldersQueryOptions());
	},
	component: LibraryScanPage,
	errorComponent: GeneralError,
});

function LibraryScanPage() {
	const scanState = createUnmappedFoldersQuery();
	const scanMutation = createScanLibraryMutation();
	const navigate = useNavigate();

	const folders = () => scanState.data?.folders || [];
	const isScanning = () => scanState.data?.is_scanning;

	return (
		<div class="flex flex-col h-full w-full min-w-0">
			{/* Sticky Header */}
			<div class="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b shrink-0">
				<div class="py-4 px-6">
					<div class="flex items-center justify-between">
						<div>
							<h1 class="text-xl font-semibold">Library Scan</h1>
							<p class="text-sm text-muted-foreground">
								<Show
									when={isScanning()}
									fallback={
										<span>{folders().length} unmapped folders found</span>
									}
								>
									<span class="flex items-center gap-2">
										<IconLoader2 class="h-3 w-3 animate-spin" />
										Scanning library...
									</span>
								</Show>
							</p>
						</div>
						<div class="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={isScanning()}
								onClick={() => scanMutation.mutate()}
							>
								<IconRefresh
									class={cn("mr-2 h-4 w-4", isScanning() && "animate-spin")}
								/>
								{isScanning() ? "Scanning..." : "Rescan"}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() =>
									navigate({
										to: "/anime",
										search: { q: "", filter: "all", view: "grid" },
									})
								}
							>
								Back
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Content - Natural scroll */}
			<div class="flex-1 overflow-y-auto overflow-x-hidden px-6">
				<Show
					when={scanState.isLoading}
					fallback={
						<Show
							when={folders().length > 0}
							fallback={
								<div class="flex flex-col items-center justify-center py-16 text-muted-foreground">
									<IconFolder class="h-12 w-12 mb-4 opacity-50" />
									<p class="text-sm">
										<Show
											when={isScanning()}
											fallback="No unmapped folders found"
										>
											Scanning for folders...
										</Show>
									</p>
									<Show when={!isScanning()}>
										<p class="text-xs mt-1">
											All folders in your library are mapped. Great job!
										</p>
									</Show>
								</div>
							}
						>
							<div class="divide-y">
								<For each={folders()}>
									{(folder) => <FolderItem folder={folder} />}
								</For>
							</div>
						</Show>
					}
				>
					<div class="flex h-full items-center justify-center">
						<IconLoader2 class="h-8 w-8 animate-spin" />
					</div>
				</Show>
			</div>
		</div>
	);
}

function FolderItem(props: { folder: UnmappedFolder }) {
	const importMutation = createImportUnmappedFolderMutation();
	const [manualMatch, setManualMatch] = createSignal<AnimeSearchResult | null>(
		null,
	);
	const [manualDialogOpen, setManualDialogOpen] = createSignal(false);

	const selectedAnime = () =>
		manualMatch() ||
		(props.folder.suggested_matches && props.folder.suggested_matches.length > 0
			? props.folder.suggested_matches[0]
			: null);

	const handleImport = () => {
		const anime = selectedAnime();
		if (!anime) return;
		importMutation.mutate({
			folder_name: props.folder.name,
			anime_id: anime.id,
		});
	};

	return (
		<div class="grid grid-cols-[1fr_1fr_auto] gap-4 py-3 items-center">
			{/* Folder Info */}
			<div class="flex items-center gap-3 min-w-0 overflow-hidden">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
					<IconFolder class="h-5 w-5 text-blue-500" />
				</div>
				<div class="min-w-0 overflow-hidden">
					<p class="font-medium text-sm truncate" title={props.folder.name}>
						{props.folder.name}
					</p>
					<p
						class="text-xs text-muted-foreground truncate"
						title={props.folder.path}
					>
						{props.folder.path}
					</p>
				</div>
			</div>

			{/* Match Info */}
			<div class="flex items-center gap-3 min-w-0 overflow-hidden">
				<Show
					when={selectedAnime()}
					fallback={
						<span class="text-sm text-muted-foreground italic">No match</span>
					}
				>
					{(anime) => (
						<>
							<Show when={anime().cover_image}>
								<img
									src={anime().cover_image}
									alt=""
									class="h-10 w-7 rounded object-cover shrink-0"
								/>
							</Show>
							<div class="min-w-0 overflow-hidden">
								<p
									class="font-medium text-sm truncate"
									title={anime().title.romaji}
								>
									{anime().title.romaji}
								</p>
								<div class="flex items-center gap-2 text-xs text-muted-foreground">
									<Show when={anime().format}>
										<span>{anime().format}</span>
									</Show>
									<Show when={anime().episode_count}>
										<span>• {anime().episode_count} eps</span>
									</Show>
									<Show when={manualMatch()}>
										<span class="text-blue-500">• Manual</span>
									</Show>
									<Show when={anime().already_in_library}>
										<span class="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 px-1.5 py-0.5 rounded font-medium text-[10px] uppercase tracking-wider">
											In Library
										</span>
									</Show>
								</div>
							</div>
						</>
					)}
				</Show>
			</div>

			{/* Actions */}
			<div class="flex items-center gap-2">
				<Dialog open={manualDialogOpen()} onOpenChange={setManualDialogOpen}>
					<DialogTrigger as={Button} variant="ghost" size="sm">
						<IconSearch class="h-4 w-4" />
					</DialogTrigger>
					<DialogContent class="sm:max-w-md">
						<DialogHeader>
							<DialogTitle>Match Folder</DialogTitle>
							<DialogDescription>
								Search for the correct anime to link with{" "}
								<span class="font-mono text-xs bg-muted px-1 rounded">
									{props.folder.name}
								</span>
							</DialogDescription>
						</DialogHeader>
						<ManualMatchSearch
							onSelect={(anime) => {
								setManualMatch(anime);
								setManualDialogOpen(false);
							}}
						/>
					</DialogContent>
				</Dialog>

				<Button
					size="sm"
					disabled={
						!selectedAnime() ||
						importMutation.isPending ||
						importMutation.isSuccess
					}
					onClick={handleImport}
				>
					<Show
						when={importMutation.isPending}
						fallback={
							<Show
								when={importMutation.isSuccess}
								fallback={
									<>
										<IconPlus class="mr-1 h-4 w-4" />
										Import
									</>
								}
							>
								<IconCheck class="mr-1 h-4 w-4" />
								Done
							</Show>
						}
					>
						<IconLoader2 class="h-4 w-4 animate-spin" />
					</Show>
				</Button>
			</div>
		</div>
	);
}

function ManualMatchSearch(props: {
	onSelect: (anime: AnimeSearchResult) => void;
}) {
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
								{(anime) => (
									<button
										type="button"
										onClick={() => props.onSelect(anime)}
										class="w-full flex items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50"
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
											<p class="font-medium text-sm truncate">
												{anime.title.romaji}
											</p>
											<p class="text-xs text-muted-foreground truncate">
												{anime.title.english}
											</p>
										</div>
										<div class="flex gap-2 text-xs text-muted-foreground">
											<Show when={anime.already_in_library}>
												<span class="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 px-1.5 py-0.5 rounded font-medium text-[10px] uppercase tracking-wider">
													In Library
												</span>
											</Show>
										</div>
									</button>
								)}
							</For>
						</div>
					</Show>
				</Show>
			</div>
		</div>
	);
}
