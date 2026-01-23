import {
	IconCheck,
	IconDeviceTv,
	IconFilter,
	IconFolder,
	IconFolderOpen,
	IconGridDots,
	IconList,
	IconPlus,
	IconSearch,
	IconTrash,
} from "@tabler/icons-solidjs";
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { AnimeListSkeleton } from "~/components/anime-list-skeleton";
import { GeneralError } from "~/components/general-error";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { animeListQueryOptions, createDeleteAnimeMutation } from "~/lib/api";

export const Route = createFileRoute("/_layout/anime/")({
	loader: ({ context: { queryClient } }) => {
		queryClient.ensureQueryData(animeListQueryOptions());
	},
	component: AnimeIndexPage,
	errorComponent: GeneralError,
});

type MonitorFilter = "all" | "monitored" | "unmonitored";
type ViewMode = "grid" | "list";

function useLocalStorage<T>(key: string, initialValue: T) {
	const stored = localStorage.getItem(key);
	const [value, setValue] = createSignal<T>(
		stored ? (JSON.parse(stored) as T) : initialValue,
	);

	createEffect(() => {
		localStorage.setItem(key, JSON.stringify(value()));
	});

	return [value, setValue] as const;
}

function AnimeIndexPage() {
	const animeQuery = useQuery(animeListQueryOptions);
	const deleteAnime = createDeleteAnimeMutation();
	const [searchFilter, setSearchFilter] = createSignal("");
	const [monitorFilter, setMonitorFilter] = useLocalStorage<MonitorFilter>(
		"anime.filters.monitor",
		"all",
	);
	const [viewMode, setViewMode] = useLocalStorage<ViewMode>(
		"anime.view.mode",
		"grid",
	);

	const filteredList = createMemo(() => {
		const list = animeQuery.data;
		if (!list) return [];

		const search = searchFilter().toLowerCase();
		const filter = monitorFilter();

		return list.filter((anime) => {
			const matchesSearch =
				anime.title.romaji.toLowerCase().includes(search) ||
				anime.title.english?.toLowerCase().includes(search) ||
				anime.title.native?.toLowerCase().includes(search);

			const matchesMonitor =
				filter === "all" ||
				(filter === "monitored" && anime.monitored) ||
				(filter === "unmonitored" && !anime.monitored);

			return matchesSearch && matchesMonitor;
		});
	});

	return (
		<div class="space-y-6">
			<div class="flex flex-col sm:flex-row gap-3">
				{/* Search and Filter */}
				<div class="relative flex-1">
					<IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Filter anime..."
						value={searchFilter()}
						onInput={(e) => setSearchFilter(e.currentTarget.value)}
						class="pl-9"
					/>
				</div>

				<div class="flex items-center justify-between sm:justify-end gap-2">
					<div class="flex items-center gap-2">
						<DropdownMenu>
							<Tooltip>
								<TooltipTrigger>
									<DropdownMenuTrigger
										// biome-ignore lint/suspicious/noExplicitAny: props type from library
										as={(props: any) => (
											<Button {...props} variant="outline" size="icon">
												<IconFilter class="h-4 w-4" />
											</Button>
										)}
									/>
								</TooltipTrigger>
								<TooltipContent>Filter by status</TooltipContent>
							</Tooltip>
							<DropdownMenuContent>
								<DropdownMenuItem onSelect={() => setMonitorFilter("all")}>
									<Show when={monitorFilter() === "all"}>
										<IconCheck class="mr-2 h-4 w-4" />
									</Show>
									<span class={monitorFilter() !== "all" ? "ml-6" : ""}>
										All Anime
									</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={() => setMonitorFilter("monitored")}
								>
									<Show when={monitorFilter() === "monitored"}>
										<IconCheck class="mr-2 h-4 w-4" />
									</Show>
									<span class={monitorFilter() !== "monitored" ? "ml-6" : ""}>
										Monitored
									</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={() => setMonitorFilter("unmonitored")}
								>
									<Show when={monitorFilter() === "unmonitored"}>
										<IconCheck class="mr-2 h-4 w-4" />
									</Show>
									<span class={monitorFilter() !== "unmonitored" ? "ml-6" : ""}>
										Unmonitored
									</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>

						{/* Actions */}
						<div class="flex items-center gap-1">
							<Tooltip>
								<TooltipTrigger>
									<Link to="/anime/import">
										<Button variant="outline" size="icon">
											<IconFolderOpen class="h-4 w-4" />
										</Button>
									</Link>
								</TooltipTrigger>
								<TooltipContent>Import from folder</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger>
									<Link to="/anime/scan">
										<Button variant="outline" size="icon">
											<IconFolder class="h-4 w-4" />
										</Button>
									</Link>
								</TooltipTrigger>
								<TooltipContent>Scan Library</TooltipContent>
							</Tooltip>
						</div>
					</div>

					<div class="flex items-center gap-2">
						<div class="h-6 w-px bg-border mx-1 hidden sm:block" />

						<div class="hidden sm:flex items-center gap-1 bg-muted/50 p-1 rounded-md">
							<Tooltip>
								<TooltipTrigger>
									<Button
										variant="ghost"
										size="icon"
										class={`h-7 w-7 ${
											viewMode() === "grid"
												? "bg-background shadow-sm"
												: "hover:bg-background/50"
										}`}
										onClick={() => setViewMode("grid")}
									>
										<IconGridDots class="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Grid view</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger>
									<Button
										variant="ghost"
										size="icon"
										class={`h-7 w-7 ${
											viewMode() === "list"
												? "bg-background shadow-sm"
												: "hover:bg-background/50"
										}`}
										onClick={() => setViewMode("list")}
									>
										<IconList class="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>List view</TooltipContent>
							</Tooltip>
						</div>

						<Tooltip>
							<TooltipTrigger>
								<Link to="/anime/add">
									<Button size="icon" class="md:hidden">
										<IconPlus class="h-4 w-4" />
									</Button>
									<Button class="hidden md:flex">
										<IconPlus class="mr-2 h-4 w-4" />
										Add Anime
									</Button>
								</Link>
							</TooltipTrigger>
							<TooltipContent>Add new anime</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</div>

			<Show when={!animeQuery.isLoading} fallback={<AnimeListSkeleton />}>
				<Show
					when={!animeQuery.isError}
					fallback={
						<div class="flex flex-col items-center justify-center h-64 gap-4">
							<p class="text-destructive">
								Error loading anime: {(animeQuery.error as Error)?.message}
							</p>
							<Button
								variant="outline"
								onClick={() => window.location.reload()}
							>
								Retry
							</Button>
						</div>
					}
				>
					<Show
						when={filteredList().length > 0}
						fallback={
							<Show
								when={!searchFilter()}
								fallback={
									<p class="text-center text-muted-foreground py-8">
										No anime matching "{searchFilter()}"
									</p>
								}
							>
								<Card class="p-12 text-center border-dashed">
									<div class="flex flex-col items-center gap-4">
										<IconDeviceTv class="h-12 w-12 text-muted-foreground/50" />
										<div>
											<h3 class="font-medium">No anime yet</h3>
											<p class="text-sm text-muted-foreground mt-1">
												Add your first anime to start monitoring
											</p>
										</div>
										<Link to="/anime/add">
											<Button>
												<IconPlus class="mr-2 h-4 w-4" />
												Add Anime
											</Button>
										</Link>
									</div>
								</Card>
							</Show>
						}
					>
						<Show
							when={viewMode() === "grid"}
							fallback={
								<div class="rounded-md border">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead class="w-[80px]">Cover</TableHead>
												<TableHead>Title</TableHead>
												<TableHead>Status</TableHead>
												<TableHead class="text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											<For each={filteredList()}>
												{(anime) => (
													<TableRow>
														<TableCell>
															<Link
																to="/anime/$id"
																params={{ id: anime.id.toString() }}
																class="block w-12 h-16 rounded-md overflow-hidden bg-muted"
															>
																<Show
																	when={anime.cover_image}
																	fallback={
																		<div class="flex items-center justify-center h-full text-muted-foreground">
																			<IconDeviceTv class="h-6 w-6" />
																		</div>
																	}
																>
																	<img
																		src={anime.cover_image}
																		alt={
																			anime.title.english || anime.title.romaji
																		}
																		class="w-full h-full object-cover"
																	/>
																</Show>
															</Link>
														</TableCell>
														<TableCell>
															<Link
																to="/anime/$id"
																params={{ id: anime.id.toString() }}
																class="block group"
															>
																<div class="font-medium group-hover:text-primary transition-colors">
																	{anime.title.english || anime.title.romaji}
																</div>
																<div class="text-xs text-muted-foreground">
																	{anime.profile_name}
																</div>
															</Link>
														</TableCell>
														<TableCell>
															<div class="flex items-center gap-2">
																<div
																	class={`h-2 w-2 rounded-full ${
																		anime.monitored
																			? "bg-green-500"
																			: "bg-yellow-500"
																	}`}
																/>
																<span class="text-sm">
																	{anime.monitored
																		? "Monitored"
																		: "Unmonitored"}
																</span>
															</div>
														</TableCell>
														<TableCell class="text-right">
															<AlertDialog>
																<AlertDialogTrigger
																	// biome-ignore lint/suspicious/noExplicitAny: props type from library
																	as={(props: any) => (
																		<Button
																			{...props}
																			variant="ghost"
																			size="icon"
																			class="h-8 w-8 text-muted-foreground hover:text-destructive"
																			onClick={(e: Event) =>
																				e.stopPropagation()
																			}
																		>
																			<IconTrash class="h-4 w-4" />
																		</Button>
																	)}
																/>
																<AlertDialogContent>
																	<AlertDialogHeader>
																		<AlertDialogTitle>
																			Delete Anime
																		</AlertDialogTitle>
																		<AlertDialogDescription>
																			Are you sure you want to delete "
																			{anime.title.english ||
																				anime.title.romaji}
																			"? This action cannot be undone.
																		</AlertDialogDescription>
																	</AlertDialogHeader>
																	<AlertDialogFooter>
																		<AlertDialogCancel>
																			Cancel
																		</AlertDialogCancel>
																		<AlertDialogAction
																			onClick={() =>
																				deleteAnime.mutate(anime.id)
																			}
																		>
																			Delete
																		</AlertDialogAction>
																	</AlertDialogFooter>
																</AlertDialogContent>
															</AlertDialog>
														</TableCell>
													</TableRow>
												)}
											</For>
										</TableBody>
									</Table>
								</div>
							}
						>
							<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
								<For each={filteredList()}>
									{(anime) => (
										<Card class="group relative flex flex-col overflow-hidden border-border/60 bg-card transition-all hover:border-foreground/20 hover:shadow-sm">
											<div class="relative aspect-[2/3] w-full overflow-hidden bg-muted">
												<Link
													to="/anime/$id"
													params={{ id: anime.id.toString() }}
													class="block h-full w-full"
												>
													<Show
														when={anime.cover_image}
														fallback={
															<div class="flex h-full items-center justify-center text-muted-foreground">
																<IconDeviceTv class="h-12 w-12 opacity-20" />
															</div>
														}
													>
														<img
															src={anime.cover_image}
															alt={anime.title.english || anime.title.romaji}
															class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
														/>
													</Show>

													{/* Gradient Overlay */}
													<div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
												</Link>

												{/* Actions overlay - Top Right */}
												<div class="absolute right-2 top-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
													<AlertDialog>
														<AlertDialogTrigger
															// biome-ignore lint/suspicious/noExplicitAny: props type from library
															as={(props: any) => (
																<Button
																	{...props}
																	size="icon"
																	variant="secondary"
																	class="h-7 w-7 shadow-sm bg-background/90 hover:bg-destructive hover:text-destructive-foreground"
																>
																	<IconTrash class="h-3.5 w-3.5" />
																</Button>
															)}
														/>
														<AlertDialogContent>
															<AlertDialogHeader>
																<AlertDialogTitle>
																	Delete Anime
																</AlertDialogTitle>
																<AlertDialogDescription>
																	Are you sure you want to delete "
																	{anime.title.english || anime.title.romaji}
																	"? This action cannot be undone.
																</AlertDialogDescription>
															</AlertDialogHeader>
															<AlertDialogFooter>
																<AlertDialogCancel>Cancel</AlertDialogCancel>
																<AlertDialogAction
																	onClick={() => deleteAnime.mutate(anime.id)}
																>
																	Delete
																</AlertDialogAction>
															</AlertDialogFooter>
														</AlertDialogContent>
													</AlertDialog>
												</div>
											</div>

											<div class="flex flex-1 flex-col gap-2 p-3">
												<Link
													to="/anime/$id"
													params={{ id: anime.id.toString() }}
													class="line-clamp-1 text-sm font-medium leading-tight text-foreground/90 transition-colors hover:text-primary"
													title={anime.title.english || anime.title.romaji}
												>
													{anime.title.english || anime.title.romaji}
												</Link>

												<div class="mt-auto flex items-center justify-between gap-2">
													<Badge
														variant="outline"
														class="h-5 rounded-sm border-border/50 px-1.5 text-[10px] font-normal text-muted-foreground/80 hover:bg-muted hover:text-foreground"
													>
														{anime.profile_name}
													</Badge>

													<Tooltip>
														<TooltipTrigger>
															<div class="flex items-center gap-1.5 p-1 -mr-1 rounded-full hover:bg-muted/50 transition-colors">
																<div
																	class={`h-1.5 w-1.5 rounded-full ${
																		anime.monitored
																			? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]"
																			: "bg-muted-foreground/40"
																	}`}
																/>
															</div>
														</TooltipTrigger>
														<TooltipContent>
															{anime.monitored ? "Monitored" : "Unmonitored"}
														</TooltipContent>
													</Tooltip>
												</div>
											</div>
										</Card>
									)}
								</For>
							</div>
						</Show>
					</Show>
				</Show>
			</Show>
		</div>
	);
}
