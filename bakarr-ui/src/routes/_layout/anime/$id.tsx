import {
	IconActivity,
	IconArrowLeft,
	IconBan,
	IconBookmark,
	IconBroadcast,
	IconCalendar,
	IconCircleCheck,
	IconCopy,
	IconDots,
	IconFolder,
	IconLayoutGrid,
	IconList,
	IconPencil,
	IconPlayerPlay,
	IconRefresh,
	IconSearch,
	IconTrash,
	IconTypography,
	IconX,
} from "@tabler/icons-solidjs";
import { useQuery } from "@tanstack/solid-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { AnimeError } from "~/components/anime-error";
import { ImportDialog } from "~/components/import-dialog";
import { RenameDialog } from "~/components/rename-dialog";
import { SearchDialog } from "~/components/search-dialog";
import { SearchModal } from "~/components/search-modal";
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
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	TextField,
	TextFieldInput,
	TextFieldLabel,
} from "~/components/ui/text-field";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import {
	animeDetailsQueryOptions,
	createBulkMapEpisodesMutation,
	createDeleteAnimeMutation,
	createDeleteEpisodeFileMutation,
	createListFilesQuery,
	createMapEpisodeMutation,
	createRefreshEpisodesMutation,
	createScanFolderMutation,
	createSearchMissingMutation,
	createToggleMonitorMutation,
	createUpdateAnimePathMutation,
	createUpdateAnimeProfileMutation,
	episodesQueryOptions,
	profilesQueryOptions,
	systemConfigQueryOptions,
} from "~/lib/api";
import { cn, copyToClipboard } from "~/lib/utils";

export const Route = createFileRoute("/_layout/anime/$id")({
	loader: async ({ context: { queryClient }, params }) => {
		const animeId = parseInt(params.id, 10);
		await Promise.all([
			queryClient.ensureQueryData(animeDetailsQueryOptions(animeId)),
			queryClient.ensureQueryData(episodesQueryOptions(animeId)),
			queryClient.ensureQueryData(systemConfigQueryOptions()),
			queryClient.ensureQueryData(profilesQueryOptions()),
		]);
	},
	component: AnimeDetailsPage,
	errorComponent: AnimeError,
});

function AnimeDetailsPage() {
	const params = useParams({ from: "/_layout/anime/$id" });
	const animeId = () => parseInt(params().id, 10);
	const navigate = useNavigate();

	const animeQuery = useQuery(() => animeDetailsQueryOptions(animeId()));
	const episodesQuery = useQuery(() => episodesQueryOptions(animeId()));
	const configQuery = useQuery(systemConfigQueryOptions);
	const profilesQuery = useQuery(profilesQueryOptions);

	const deleteAnime = createDeleteAnimeMutation();
	const refreshEpisodes = createRefreshEpisodesMutation();
	const scanFolder = createScanFolderMutation();
	const searchMissing = createSearchMissingMutation();
	const toggleMonitor = createToggleMonitorMutation();
	const deleteEpisodeFile = createDeleteEpisodeFileMutation();
	const updatePath = createUpdateAnimePathMutation();
	const updateProfile = createUpdateAnimeProfileMutation();
	const _mapEpisode = createMapEpisodeMutation();

	const [renameDialogOpen, setRenameDialogOpen] = createSignal(false);
	const [editPathOpen, setEditPathOpen] = createSignal(false);
	const [editProfileOpen, setEditProfileOpen] = createSignal(false);
	const [searchModalState, setSearchModalState] = createSignal<{
		open: boolean;
		episodeNumber: number;
		episodeTitle?: string;
	}>({
		open: false,
		episodeNumber: 1,
	});
	const [deleteEpisodeState, setDeleteEpisodeState] = createSignal<{
		open: boolean;
		episodeNumber: number;
	}>({
		open: false,
		episodeNumber: 0,
	});
	const [mappingDialogState, setMappingDialogState] = createSignal<{
		open: boolean;
		episodeNumber: number;
	}>({
		open: false,
		episodeNumber: 0,
	});
	const [bulkMappingOpen, setBulkMappingOpen] = createSignal(false);

	const missingCount = () =>
		episodesQuery.data?.filter((e) => !e.downloaded).length || 0;
	const availableCount = () =>
		episodesQuery.data?.filter((e) => e.downloaded).length || 0;
	const totalEpisodes = () =>
		episodesQuery.data?.length || animeQuery.data?.episode_count || 0;
	const isMonitored = () => animeQuery.data?.monitored ?? true;

	const handlePlayInMpv = (episodeNumber: number) => {
		const apiKey = configQuery.data?.auth.api_key || "";

		const origin = window.location.origin;
		const streamUrl = `${origin}/api/stream/${animeId()}/${episodeNumber}?token=${apiKey}`;
		window.open(`mpv://${streamUrl}`, "_self");
	};

	const handleCopyStreamLink = async (episodeNumber: number) => {
		const apiKey = configQuery.data?.auth.api_key || "";
		const origin = window.location.origin;
		const streamUrl = `${origin}/api/stream/${animeId()}/${episodeNumber}?token=${apiKey}`;
		await copyToClipboard(streamUrl, "Stream URL");
	};

	return (
		<div class="space-y-6 p-6">
			<Show when={animeQuery.data}>
				{(anime) => (
					<>
						{/* Banner */}
						<Show when={anime().banner_image}>
							<div class="w-full h-48 md:h-64 overflow-hidden rounded-lg relative">
								<img
									src={anime().banner_image}
									alt="Banner"
									class="w-full h-full object-cover"
								/>
								<div class="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
							</div>
						</Show>

						{/* Header */}
						<div class="flex flex-col md:flex-row md:items-center gap-4 relative">
							<div class="flex items-center gap-4 flex-1 min-w-0">
								<Link to="/anime">
									<Button variant="ghost" size="icon" class="shrink-0">
										<IconArrowLeft class="h-4 w-4" />
									</Button>
								</Link>
								<div class="flex-1 min-w-0">
									<h1 class="text-xl font-semibold tracking-tight overflow-hidden flex items-center gap-3 min-w-0">
										<span
											class="truncate min-w-0 flex-1"
											title={anime().title.english || anime().title.romaji}
										>
											{anime().title.english || anime().title.romaji}
										</span>
									</h1>
									<div class="flex items-center gap-2 text-sm text-muted-foreground">
										<Badge variant="secondary" class="text-xs">
											{anime().format}
										</Badge>
										<Tooltip>
											<TooltipTrigger>
												<Show when={anime().status === "RELEASING"}>
													<IconBroadcast class="w-4 h-4 text-green-500" />
												</Show>
												<Show when={anime().status === "FINISHED"}>
													<IconCircleCheck class="w-4 h-4 text-blue-500" />
												</Show>
												<Show when={anime().status === "NOT_YET_RELEASED"}>
													<IconCalendar class="w-4 h-4 text-orange-500" />
												</Show>
												<Show when={anime().status === "CANCELLED"}>
													<IconBan class="w-4 h-4 text-red-500" />
												</Show>
												<Show
													when={
														![
															"RELEASING",
															"FINISHED",
															"NOT_YET_RELEASED",
															"CANCELLED",
														].includes(anime().status)
													}
												>
													<IconActivity class="w-4 h-4 text-muted-foreground" />
												</Show>
											</TooltipTrigger>
											<TooltipContent>{anime().status}</TooltipContent>
										</Tooltip>
										<Show when={anime().title.native}>
											<span>•</span>
											<span class="font-japanese opacity-75">
												{anime().title.native}
											</span>
										</Show>
									</div>
								</div>
							</div>

							<div class="flex gap-2 overflow-x-auto pb-2 -mb-2 no-scrollbar md:overflow-visible md:pb-0 md:mb-0">
								<Tooltip>
									<TooltipTrigger
										as={Button}
										variant={isMonitored() ? "default" : "outline"}
										size="sm"
										onClick={() =>
											toggleMonitor.mutate({
												id: animeId(),
												monitored: !isMonitored(),
											})
										}
										disabled={toggleMonitor.isPending}
										class={cn(
											"shrink-0",
											!isMonitored() && "text-muted-foreground bg-muted/50",
										)}
									>
										<IconBookmark
											class={cn("h-4 w-4", isMonitored() && "fill-current")}
										/>
									</TooltipTrigger>
									<TooltipContent>
										{isMonitored() ? "Unmonitor Anime" : "Monitor Anime"}
									</TooltipContent>
								</Tooltip>

								<Tooltip>
									<TooltipTrigger
										as={Button}
										variant="outline"
										size="sm"
										onClick={() => refreshEpisodes.mutate(animeId())}
										disabled={refreshEpisodes.isPending}
										class="shrink-0"
									>
										<IconRefresh
											class={cn(
												"min-[1670px]:mr-2 h-4 w-4",
												refreshEpisodes.isPending && "animate-spin",
											)}
										/>
										<span class="hidden min-[1670px]:inline">Refresh</span>
									</TooltipTrigger>
									<TooltipContent>Refresh Metadata</TooltipContent>
								</Tooltip>

								<SearchDialog
									animeId={animeId()}
									defaultQuery={anime().title.romaji}
									tooltip="Search Releases"
									trigger={
										<Button variant="outline" size="sm" class="shrink-0">
											<IconSearch class="min-[1670px]:mr-2 h-4 w-4" />
											<span class="hidden min-[1670px]:inline">Search</span>
										</Button>
									}
								/>

								<Tooltip>
									<TooltipTrigger
										as={Button}
										variant="outline"
										size="sm"
										onClick={() => searchMissing.mutate(animeId())}
										disabled={searchMissing.isPending || missingCount() === 0}
										class="shrink-0"
									>
										<IconSearch class="min-[1670px]:mr-2 h-4 w-4" />
										<span class="hidden min-[1670px]:inline">
											Search Missing
										</span>
									</TooltipTrigger>
									<TooltipContent>Search Missing Episodes</TooltipContent>
								</Tooltip>

								<Tooltip>
									<TooltipTrigger
										as={Button}
										variant="outline"
										size="sm"
										onClick={() =>
											toast.promise(scanFolder.mutateAsync(animeId()), {
												loading: "Scanning folder...",
												success: (data) =>
													`Scan complete. Found ${data.found} new episodes.`,
												error: (err) => `Scan failed: ${err.message}`,
											})
										}
										class="shrink-0"
									>
										<IconFolder class="min-[1670px]:mr-2 h-4 w-4" />
										<span class="hidden min-[1670px]:inline">Scan Folder</span>
									</TooltipTrigger>
									<TooltipContent>Scan Folder</TooltipContent>
								</Tooltip>

								<Tooltip>
									<TooltipTrigger
										as={Button}
										variant="outline"
										size="sm"
										onClick={() => setRenameDialogOpen(true)}
										class="shrink-0"
									>
										<IconTypography class="min-[1670px]:mr-2 h-4 w-4" />
										<span class="hidden min-[1670px]:inline">Rename</span>
									</TooltipTrigger>
									<TooltipContent>Rename Files</TooltipContent>
								</Tooltip>

								<ImportDialog
									animeId={animeId()}
									tooltip="Import Files"
									trigger={
										<Button variant="outline" size="sm" class="shrink-0">
											<IconFolder class="min-[1670px]:mr-2 h-4 w-4" />
											<span class="hidden min-[1670px]:inline">Import</span>
										</Button>
									}
								/>

								<Tooltip>
									<TooltipTrigger
										as={Button}
										variant="outline"
										size="sm"
										onClick={() => setBulkMappingOpen(true)}
										class="shrink-0"
									>
										<IconList class="min-[1670px]:mr-2 h-4 w-4" />
										<span class="hidden min-[1670px]:inline">Map Episodes</span>
									</TooltipTrigger>
									<TooltipContent>Manual Map Episodes</TooltipContent>
								</Tooltip>

								<AlertDialog>
									<Tooltip>
										<TooltipTrigger
											as={AlertDialogTrigger}
											variant="ghost"
											size="icon"
											class="text-muted-foreground hover:text-destructive shrink-0 h-9 w-9"
										>
											<IconTrash class="h-4 w-4" />
										</TooltipTrigger>
										<TooltipContent>Delete Anime</TooltipContent>
									</Tooltip>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Delete Anime?</AlertDialogTitle>
											<AlertDialogDescription>
												This will remove "
												{anime().title.english || anime().title.romaji}" from
												your library. This action cannot be undone.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												onClick={() => {
													deleteAnime.mutate(animeId(), {
														onSuccess: () => navigate({ to: "/anime" }),
													});
												}}
												class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
											>
												Delete
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</div>
						</div>

						{/* Content */}
						<div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
							{/* Cover */}
							<div class="space-y-4">
								<Card class="overflow-hidden">
									<Show
										when={anime().cover_image}
										fallback={
											<div class="w-full aspect-[2/3] bg-muted flex items-center justify-center">
												<IconPlayerPlay class="h-16 w-16 text-muted-foreground/30" />
											</div>
										}
									>
										<img
											src={anime().cover_image}
											alt={anime().title.english || anime().title.romaji}
											class="w-full aspect-[2/3] object-cover"
										/>
									</Show>
								</Card>

								<Show when={anime().score}>
									<Card>
										<CardContent class="p-3 flex items-center justify-between">
											<span class="text-sm font-medium">Score</span>
											<span class="font-bold text-lg">{anime().score}</span>
										</CardContent>
									</Card>
								</Show>

								<Show
									when={anime().studios && (anime().studios?.length ?? 0) > 0}
								>
									<div class="space-y-1.5">
										<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
											Studios
										</h3>
										<div class="flex flex-wrap gap-1">
											<For each={anime().studios}>
												{(studio) => (
													<Badge variant="outline" class="text-xs">
														{studio}
													</Badge>
												)}
											</For>
										</div>
									</div>
								</Show>

								<Show
									when={anime().genres && (anime().genres?.length ?? 0) > 0}
								>
									<div class="space-y-1.5">
										<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
											Genres
										</h3>
										<div class="flex flex-wrap gap-1">
											<For each={anime().genres}>
												{(genre) => (
													<Badge variant="secondary" class="text-xs">
														{genre}
													</Badge>
												)}
											</For>
										</div>
									</div>
								</Show>
							</div>

							{/* Details */}
							<div class="lg:col-span-3 space-y-6">
								{/* Synopsis */}
								<Show when={anime().description}>
									<Card>
										<CardHeader class="pb-3">
											<CardTitle class="text-base">Synopsis</CardTitle>
										</CardHeader>
										<CardContent>
											<p class="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
												{anime().description}
											</p>
										</CardContent>
									</Card>
								</Show>

								{/* Stats */}
								<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
									<Card>
										<CardContent class="p-4 text-center">
											<p class="text-2xl font-bold">{totalEpisodes()}</p>
											<p class="text-xs text-muted-foreground">Total</p>
										</CardContent>
									</Card>
									<Card>
										<CardContent class="p-4 text-center">
											<p class="text-2xl font-bold text-green-500">
												{availableCount()}
											</p>
											<p class="text-xs text-muted-foreground">Downloaded</p>
										</CardContent>
									</Card>
									<Card>
										<CardContent class="p-4 text-center">
											<p class="text-2xl font-bold text-orange-500">
												{missingCount()}
											</p>
											<p class="text-xs text-muted-foreground">Missing</p>
										</CardContent>
									</Card>
									<Card>
										<CardContent class="p-4 text-center group relative">
											<Badge variant="secondary">{anime().profile_name}</Badge>
											<p class="text-xs text-muted-foreground mt-1">Profile</p>
											<Button
												variant="ghost"
												size="icon"
												class="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
												onClick={() => setEditProfileOpen(true)}
											>
												<IconPencil class="h-3 w-3" />
											</Button>
										</CardContent>
									</Card>
								</div>

								{/* Episodes */}
								<Tabs defaultValue="grid" class="w-full">
									<Card>
										<CardHeader class="pb-3 flex flex-row items-center justify-between space-y-0">
											<CardTitle class="text-base">Episodes</CardTitle>
											<TabsList>
												<TabsTrigger value="grid">
													<IconLayoutGrid class="h-4 w-4 mr-2" />
													Grid
												</TabsTrigger>
												<TabsTrigger value="table">
													<IconList class="h-4 w-4 mr-2" />
													Table
												</TabsTrigger>
											</TabsList>
										</CardHeader>
										<CardContent>
											<TabsContent value="grid">
												<Show when={episodesQuery.data?.length === 0}>
													<div class="text-center py-8">
														<p class="text-sm text-muted-foreground">
															No episodes found.
														</p>
														<Button
															variant="link"
															onClick={() => refreshEpisodes.mutate(animeId())}
															class="mt-2"
														>
															Refresh metadata
														</Button>
													</div>
												</Show>
												<Show
													when={
														episodesQuery.data && episodesQuery.data.length > 0
													}
												>
													<div class="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5">
														<For each={episodesQuery.data}>
															{(episode) => (
																<div
																	class={`aspect-square rounded-md flex items-center justify-center text-xs font-mono transition-all ${
																		episode.downloaded
																			? "bg-green-500/20 text-green-500 border border-green-500/30"
																			: "bg-muted/50 text-muted-foreground border border-transparent"
																	}`}
																	title={`Episode ${episode.number}: ${episode.downloaded ? "Downloaded" : "Missing"}`}
																>
																	{episode.number}
																</div>
															)}
														</For>
													</div>
												</Show>
											</TabsContent>

											<TabsContent value="table">
												<div class="border rounded-md overflow-x-auto">
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead class="w-[60px] text-center">
																	#
																</TableHead>
																<TableHead>Title</TableHead>
																<TableHead class="hidden sm:table-cell w-[120px]">
																	Aired
																</TableHead>
																<TableHead class="w-[80px] text-right">
																	Status
																</TableHead>
																<TableHead class="hidden md:table-cell">
																	Filename
																</TableHead>
																<TableHead class="w-[50px]"></TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															<Show when={episodesQuery.data?.length === 0}>
																<TableRow>
																	<TableCell
																		colSpan={6}
																		class="h-24 text-center"
																	>
																		No episodes found.
																	</TableCell>
																</TableRow>
															</Show>
															<For each={episodesQuery.data}>
																{(episode) => (
																	<TableRow class="group cursor-default">
																		<TableCell class="font-medium text-center text-muted-foreground group-hover:text-foreground">
																			{episode.number}
																		</TableCell>
																		<TableCell class="font-medium max-w-[150px] sm:max-w-[250px] md:max-w-[350px]">
																			<div
																				class="truncate"
																				title={
																					episode.title ||
																					`Episode ${episode.number}`
																				}
																			>
																				{episode.title ||
																					`Episode ${episode.number}`}
																			</div>
																		</TableCell>
																		<TableCell class="hidden sm:table-cell text-muted-foreground text-sm">
																			{episode.aired
																				? new Date(
																						episode.aired,
																					).toLocaleDateString()
																				: "-"}
																		</TableCell>
																		<TableCell class="text-right">
																			<div class="flex justify-end pr-2">
																				<Show
																					when={episode.downloaded}
																					fallback={
																						<Tooltip>
																							<TooltipTrigger>
																								<IconX class="h-4 w-4 text-muted-foreground/30" />
																							</TooltipTrigger>
																							<TooltipContent>
																								Missing
																							</TooltipContent>
																						</Tooltip>
																					}
																				>
																					<Tooltip>
																						<TooltipTrigger>
																							<IconCircleCheck class="h-4 w-4 text-green-500" />
																						</TooltipTrigger>
																						<TooltipContent>
																							Downloaded -{" "}
																							{episode.file_path
																								?.split("/")
																								.pop()}
																						</TooltipContent>
																					</Tooltip>
																				</Show>
																			</div>
																		</TableCell>
																		<TableCell class="hidden md:table-cell text-sm text-muted-foreground font-mono truncate max-w-[200px]">
																			<Show
																				when={episode.file_path}
																				fallback="-"
																			>
																				<div
																					class="truncate"
																					title={episode.file_path
																						?.split("/")
																						.pop()}
																				>
																					{episode.file_path?.split("/").pop()}
																				</div>
																			</Show>
																		</TableCell>
																		<TableCell>
																			<DropdownMenu>
																				<DropdownMenuTrigger
																					as={Button}
																					variant="ghost"
																					size="icon"
																					class="h-8 w-8 text-muted-foreground hover:text-foreground"
																				>
																					<IconDots class="h-4 w-4" />
																				</DropdownMenuTrigger>
																				<DropdownMenuContent>
																					<DropdownMenuItem
																						onClick={() =>
																							setSearchModalState({
																								open: true,
																								episodeNumber: episode.number,
																								episodeTitle: episode.title,
																							})
																						}
																					>
																						<Show
																							when={episode.downloaded}
																							fallback={
																								<>
																									<IconSearch class="h-4 w-4 mr-2" />
																									Search
																								</>
																							}
																						>
																							<IconRefresh class="h-4 w-4 mr-2" />
																							Replace
																						</Show>
																					</DropdownMenuItem>
																					<Show when={!episode.downloaded}>
																						<DropdownMenuItem
																							onClick={() =>
																								setMappingDialogState({
																									open: true,
																									episodeNumber: episode.number,
																								})
																							}
																						>
																							<IconFolder class="h-4 w-4 mr-2" />
																							Manual Map
																						</DropdownMenuItem>
																					</Show>
																					<Show when={episode.downloaded}>
																						<DropdownMenuSeparator />
																						<DropdownMenuItem
																							class="text-destructive focus:text-destructive"
																							onClick={(e) => {
																								e.stopPropagation();
																								setDeleteEpisodeState({
																									open: true,
																									episodeNumber: episode.number,
																								});
																							}}
																						>
																							<IconTrash class="h-4 w-4 mr-2" />
																							Delete File
																						</DropdownMenuItem>
																						<DropdownMenuSeparator />
																						<DropdownMenuItem
																							onClick={() =>
																								handlePlayInMpv(episode.number)
																							}
																						>
																							<IconPlayerPlay class="h-4 w-4 mr-2" />
																							Play in MPV
																						</DropdownMenuItem>
																						<DropdownMenuItem
																							onClick={() =>
																								handleCopyStreamLink(
																									episode.number,
																								)
																							}
																						>
																							<IconCopy class="h-4 w-4 mr-2" />
																							Copy Stream Link
																						</DropdownMenuItem>
																					</Show>
																				</DropdownMenuContent>
																			</DropdownMenu>
																		</TableCell>
																	</TableRow>
																)}
															</For>
														</TableBody>
													</Table>
												</div>
											</TabsContent>
										</CardContent>
									</Card>
								</Tabs>

								{/* Info */}
								<Card>
									<CardHeader class="pb-3">
										<CardTitle class="text-base">Details</CardTitle>
									</CardHeader>
									<CardContent>
										<dl class="grid grid-cols-2 gap-4 text-sm">
											<div>
												<dt class="text-muted-foreground">Root Folder</dt>
												<dd class="font-mono text-xs mt-1 truncate flex items-center justify-between gap-2 group">
													<span class="truncate" title={anime().root_folder}>
														{anime().root_folder}
													</span>
													<Button
														variant="ghost"
														size="icon"
														class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
														onClick={() => setEditPathOpen(true)}
													>
														<IconPencil class="h-3 w-3" />
													</Button>
												</dd>
											</div>
											<div>
												<dt class="text-muted-foreground">Added</dt>
												<dd class="mt-1">
													{new Date(anime().added_at).toLocaleDateString()}
												</dd>
											</div>
										</dl>
									</CardContent>
								</Card>
							</div>
						</div>
					</>
				)}
			</Show>

			{/* Dialogs */}
			<SearchModal
				animeId={animeId()}
				episodeNumber={searchModalState().episodeNumber}
				episodeTitle={searchModalState().episodeTitle}
				open={searchModalState().open}
				onOpenChange={(open) =>
					setSearchModalState((prev) => ({ ...prev, open }))
				}
			/>

			<RenameDialog
				animeId={animeId()}
				open={renameDialogOpen()}
				onOpenChange={setRenameDialogOpen}
			/>

			<ManualMappingDialog
				animeId={animeId()}
				episodeNumber={mappingDialogState().episodeNumber}
				open={mappingDialogState().open}
				onOpenChange={(open) =>
					setMappingDialogState((prev) => ({ ...prev, open }))
				}
			/>

			<BulkMappingDialog
				animeId={animeId()}
				open={bulkMappingOpen()}
				onOpenChange={setBulkMappingOpen}
			/>

			<AlertDialog
				open={deleteEpisodeState().open}
				onOpenChange={(open) =>
					setDeleteEpisodeState((prev) => ({ ...prev, open }))
				}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete Episode {deleteEpisodeState().episodeNumber}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This will delete the file from disk. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								deleteEpisodeFile.mutate(
									{
										animeId: animeId(),
										episodeNumber: deleteEpisodeState().episodeNumber,
									},
									{
										onSuccess: () => {
											toast.success("Episode file deleted");
										},
										onError: (err) => {
											toast.error(`Failed to delete file: ${err.message}`);
										},
									},
								);
								setDeleteEpisodeState((prev) => ({ ...prev, open: false }));
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<BulkMappingDialog
				animeId={animeId()}
				open={bulkMappingOpen()}
				onOpenChange={setBulkMappingOpen}
			/>

			<EditPathDialog
				open={editPathOpen()}
				onOpenChange={setEditPathOpen}
				currentPath={animeQuery.data?.root_folder || ""}
				animeId={animeId()}
				updateMutation={updatePath}
			/>

			<EditProfileDialog
				open={editProfileOpen()}
				onOpenChange={setEditProfileOpen}
				currentProfile={animeQuery.data?.profile_name || ""}
				animeId={animeId()}
				updateMutation={updateProfile}
				profiles={profilesQuery.data || []}
			/>
		</div>
	);
}

function EditProfileDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentProfile: string;
	animeId: number;
	// biome-ignore lint/suspicious/noExplicitAny: mutation type inferred
	updateMutation: any;
	// biome-ignore lint/suspicious/noExplicitAny: profile type imported
	profiles: any[];
}) {
	const [profile, setProfile] = createSignal(props.currentProfile);

	createSignal(() => {
		if (props.open && props.currentProfile) setProfile(props.currentProfile);
	});

	const handleSubmit = (e: Event) => {
		e.preventDefault();
		props.updateMutation.mutate(
			{ id: props.animeId, profileName: profile() },
			{
				onSuccess: () => {
					props.onOpenChange(false);
					toast.success("Profile updated successfully");
				},
				onError: (err: Error) => {
					toast.error(`Failed to update profile: ${err.message}`);
				},
			},
		);
	};

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Quality Profile</DialogTitle>
					<DialogDescription>
						Change the quality profile for this anime.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} class="space-y-4">
					<div class="space-y-2">
						<label
							class="text-sm font-medium leading-none"
							for="profile-select"
						>
							Profile
						</label>
						<Select
							value={profile()}
							onChange={(val) => val && setProfile(val)}
							options={props.profiles.map((p) => p.name)}
							placeholder="Select profile..."
							itemComponent={(props) => (
								<SelectItem item={props.item}>
									{props.item.rawValue}
								</SelectItem>
							)}
						>
							<SelectTrigger class="w-full">
								<SelectValue<string>>
									{(state) => state.selectedOption()}
								</SelectValue>
							</SelectTrigger>
							<SelectContent />
						</Select>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => props.onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={props.updateMutation.isPending}>
							{props.updateMutation.isPending ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function BulkMappingDialog(props: {
	animeId: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const episodesQuery = useQuery(() => episodesQueryOptions(props.animeId));
	const filesQuery = createListFilesQuery(() => props.animeId);
	const bulkMapMutation = createBulkMapEpisodesMutation();

	const [mappings, setMappings] = createSignal<Record<number, string>>({});

	const files = () => filesQuery.data || [];
	const allEpisodes = () => episodesQuery.data || [];

	const handleMap = (episodeNumber: number, filePath: string) => {
		setMappings((prev) => {
			const next = { ...prev };
			if (filePath === "") {
				delete next[episodeNumber];
			} else {
				next[episodeNumber] = filePath;
			}
			return next;
		});
	};

	const handleSubmit = () => {
		const entries = Object.entries(mappings());
		if (entries.length === 0) return;

		const payload = entries.map(([epNum, path]) => ({
			episode_number: parseInt(epNum, 10),
			file_path: path,
		}));

		bulkMapMutation.mutate(
			{
				animeId: props.animeId,
				mappings: payload,
			},
			{
				onSuccess: () => {
					toast.success(`Successfully mapped ${entries.length} episodes`);
					props.onOpenChange(false);
					setMappings({});
				},
				onError: (err: Error) => {
					toast.error(`Failed to map episodes: ${err.message}`);
				},
			},
		);
	};

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="sm:max-w-[800px] max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Bulk Manual Mapping</DialogTitle>
					<DialogDescription>
						Map files to episodes manually. Showing all episodes and files.
					</DialogDescription>
				</DialogHeader>

				<div class="flex-1 overflow-y-auto py-4">
					<Show
						when={episodesQuery.data && filesQuery.data}
						fallback={
							<div class="flex justify-center py-8">
								<IconRefresh class="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						}
					>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="w-[80px]">Episode</TableHead>
									<TableHead>File to Map</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<For each={allEpisodes()}>
									{(episode) => (
										<TableRow>
											<TableCell class="font-medium">
												Ep {episode.number}
											</TableCell>
											<TableCell>
												<select
													class="w-full bg-background border rounded-md px-2 py-1 text-sm"
													value={
														mappings()[episode.number] ??
														episode.file_path ??
														""
													}
													onChange={(e) =>
														handleMap(episode.number, e.currentTarget.value)
													}
												>
													<option value="">(Unmap / No File)</option>
													<For each={files()}>
														{(file) => (
															<option value={file.path}>
																{file.name} (
																{(file.size / 1024 / 1024).toFixed(1)} MB)
																{file.episode_number
																	? ` [Ep ${file.episode_number}]`
																	: ""}
															</option>
														)}
													</For>
												</select>
											</TableCell>
										</TableRow>
									)}
								</For>
							</TableBody>
						</Table>
					</Show>
				</div>

				<DialogFooter class="mt-4">
					<Button variant="outline" onClick={() => props.onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={
							Object.keys(mappings()).length === 0 || bulkMapMutation.isPending
						}
					>
						{bulkMapMutation.isPending ? "Mapping..." : "Save Mappings"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EditPathDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentPath: string;
	animeId: number;
	// biome-ignore lint/suspicious/noExplicitAny: mutation type inferred
	updateMutation: any;
}) {
	const [path, setPath] = createSignal(props.currentPath);
	const [rescan, setRescan] = createSignal(true);

	createSignal(() => {
		if (props.open && props.currentPath) setPath(props.currentPath);
	});

	const handleSubmit = (e: Event) => {
		e.preventDefault();
		props.updateMutation.mutate(
			{ id: props.animeId, path: path(), rescan: rescan() },
			{
				onSuccess: () => {
					props.onOpenChange(false);
					toast.success("Path updated successfully");
				},
				onError: (err: Error) => {
					toast.error(`Failed to update path: ${err.message}`);
				},
			},
		);
	};

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Root Path</DialogTitle>
					<DialogDescription>
						Change the folder path for this anime.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} class="space-y-4">
					<div class="space-y-2">
						<TextField value={path()} onChange={setPath}>
							<TextFieldLabel>Path</TextFieldLabel>
							<TextFieldInput placeholder="/path/to/anime" />
						</TextField>
					</div>
					<div class="flex items-center space-x-2">
						<Checkbox id="rescan" checked={rescan()} onChange={setRescan} />
						<label
							for="rescan"
							class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							Rescan folder after update
						</label>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => props.onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={props.updateMutation.isPending}>
							{props.updateMutation.isPending ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ManualMappingDialog(props: {
	animeId: number;
	episodeNumber: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const filesQuery = createListFilesQuery(() => props.animeId);
	const mapMutation = createMapEpisodeMutation();
	const [selectedFile, setSelectedFile] = createSignal<string | null>(null);

	const handleSubmit = () => {
		const file = selectedFile();
		if (!file) return;

		mapMutation.mutate(
			{
				animeId: props.animeId,
				episodeNumber: props.episodeNumber,
				filePath: file,
			},
			{
				onSuccess: () => {
					toast.success("Episode mapped successfully");
					props.onOpenChange(false);
					setSelectedFile(null);
				},
				onError: (err) => {
					toast.error(`Failed to map episode: ${err.message}`);
				},
			},
		);
	};

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle>
						Manual Mapping - Episode {props.episodeNumber}
					</DialogTitle>
					<DialogDescription>
						Select a file from the anime directory to map to this episode.
					</DialogDescription>
				</DialogHeader>

				<div class="py-4">
					<Show
						when={filesQuery.data}
						fallback={
							<div class="flex justify-center py-8">
								<IconRefresh class="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						}
					>
						{(files) => (
							<div class="border rounded-md max-h-[300px] overflow-y-auto">
								<Show when={files().length === 0}>
									<div class="p-4 text-center text-sm text-muted-foreground">
										No video files found in the anime directory.
									</div>
								</Show>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead class="w-[30px]" />
											<TableHead>Filename</TableHead>
											<TableHead class="w-[100px] text-right">Size</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<For each={files()}>
											{(file) => (
												<TableRow
													class={cn(
														"cursor-pointer hover:bg-muted/50",
														selectedFile() === file.path && "bg-muted",
													)}
													onClick={() => setSelectedFile(file.path)}
												>
													<TableCell>
														<div
															class={cn(
																"h-4 w-4 rounded-full border border-primary",
																selectedFile() === file.path && "bg-primary",
															)}
														/>
													</TableCell>
													<TableCell class="font-mono text-xs break-all">
														{file.name}
														<Show when={file.episode_number}>
															<span class="ml-2 text-muted-foreground italic">
																(Mapped to Ep {file.episode_number})
															</span>
														</Show>
													</TableCell>
													<TableCell class="text-right text-xs">
														{(file.size / 1024 / 1024).toFixed(1)} MB
													</TableCell>
												</TableRow>
											)}
										</For>
									</TableBody>
								</Table>
							</div>
						)}
					</Show>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => props.onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!selectedFile() || mapMutation.isPending}
					>
						{mapMutation.isPending ? "Mapping..." : "Map File"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
