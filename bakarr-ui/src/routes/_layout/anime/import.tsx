import {
	IconAlertTriangle,
	IconArrowLeft,
	IconArrowRight,
	IconCheck,
	IconFile,
	IconFolderOpen,
	IconListTree,
	IconLoader2,
	IconPlus,
	IconSearch,
	IconTypography,
	IconUpload,
	IconX,
} from "@tabler/icons-solidjs";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	Show,
	Suspense,
} from "solid-js";
import { toast } from "solid-sonner";
import { EditMappingPopover } from "~/components/edit-mapping-popover";
import { FileBrowser } from "~/components/file-browser";
import { GeneralError } from "~/components/general-error";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
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
	type AnimeSearchResult,
	animeListQueryOptions,
	createAddAnimeMutation,
	createAnimeListQuery,
	createAnimeSearchQuery,
	createImportFilesMutation,
	createProfilesQuery,
	createScanImportPathMutation,
	type ImportFileRequest,
	profilesQueryOptions,
	type ScannedFile,
} from "~/lib/api";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_layout/anime/import")({
	loader: ({ context: { queryClient } }) => {
		queryClient.ensureQueryData(animeListQueryOptions());
		queryClient.ensureQueryData(profilesQueryOptions());
	},
	component: ImportPage,
	errorComponent: GeneralError,
});

type Step = "scan" | "review";

const steps: { id: Step; label: string; description: string }[] = [
	{ id: "scan", label: "Select Path", description: "Choose a folder to scan" },
	{
		id: "review",
		label: "Review Files",
		description: "Confirm files to import",
	},
];

function ImportPage() {
	const navigate = useNavigate();
	const [path, setPath] = createSignal("");
	const [step, setStep] = createSignal<Step>("scan");
	const [selectedFiles, setSelectedFiles] = createSignal<
		Map<string, ImportFileRequest>
	>(new Map());
	const [inputMode, setInputMode] = createSignal<"browser" | "manual">(
		"browser",
	);
	const [isDragOver, setIsDragOver] = createSignal(false);

	const scanMutation = createScanImportPathMutation();
	const importMutation = createImportFilesMutation();
	const addAnimeMutation = createAddAnimeMutation();
	const animeListQuery = createAnimeListQuery();
	const profilesQuery = createProfilesQuery();

	const scannedFiles = createMemo(() => {
		const files = scanMutation.data?.files || [];
		return [...files].sort((a, b) => {
			const seasonA = a.season || 0;
			const seasonB = b.season || 0;
			if (seasonA !== seasonB) return seasonA - seasonB;
			return a.episode_number - b.episode_number;
		});
	});

	const skippedFiles = createMemo(() => scanMutation.data?.skipped || []);

	const [selectedCandidateIds, setSelectedCandidateIds] = createSignal<
		Set<number>
	>(new Set());
	const [manualCandidates, setManualCandidates] = createSignal<
		AnimeSearchResult[]
	>([]);
	const [isSearchOpen, setIsSearchOpen] = createSignal(false);

	const candidates = createMemo(() => [
		...(scanMutation.data?.candidates || []),
		...manualCandidates().filter(
			(mc) => !scanMutation.data?.candidates.some((c) => c.id === mc.id),
		),
	]);

	const handleManualAdd = (candidate: AnimeSearchResult) => {
		setManualCandidates((prev) => [...prev, candidate]);

		setIsSearchOpen(false);

		setSelectedCandidateIds((prev) => {
			const next = new Set(prev);
			next.add(candidate.id);
			return next;
		});

		toggleCandidate(candidate);
	};

	const handleScan = () => {
		scanMutation.mutate(
			{ path: path(), anime_id: undefined },
			{
				onSuccess: (data) => {
					const preselected = new Map<string, ImportFileRequest>();
					const newSelectedCandidates = new Set<number>();

					data.files.forEach((file) => {
						if (file.matched_anime) {
							preselected.set(file.source_path, {
								source_path: file.source_path,
								anime_id: file.matched_anime.id,
								episode_number: Math.floor(file.episode_number),
								season: file.season,
							});
						} else if (file.suggested_candidate_id) {
							preselected.set(file.source_path, {
								source_path: file.source_path,
								anime_id: file.suggested_candidate_id,
								episode_number: Math.floor(file.episode_number),
								season: file.season,
							});
							newSelectedCandidates.add(file.suggested_candidate_id);
						}
					});
					setSelectedFiles(preselected);
					setSelectedCandidateIds(newSelectedCandidates);
					setStep("review");
				},
			},
		);
	};

	const handleImport = async () => {
		const files = Array.from(selectedFiles().values());

		const uniqueAnimeIds = new Set(files.map((f) => f.anime_id));
		const localAnimeIds = new Set(animeListQuery.data?.map((a) => a.id));
		const newAnimeIds = Array.from(uniqueAnimeIds).filter(
			(id) => !localAnimeIds.has(id),
		);

		if (newAnimeIds.length > 0) {
			const candidate = scanMutation.data?.candidates.find(
				(c) => c.id === newAnimeIds[0],
			);
			if (candidate) {
				const toastId = toast.loading(
					`Adding new anime: ${candidate.title.romaji}...`,
				);
				try {
					await addAnimeMutation.mutateAsync({
						id: candidate.id,
						profile_name: profilesQuery.data?.[0]?.name || "Any",
						root_folder: "",
						monitor_and_search: false,
						monitored: true,
						release_profile_ids: [],
					});
					toast.success(`Added ${candidate.title.romaji}`, { id: toastId });
				} catch (err) {
					toast.error(`Failed to add anime: ${(err as Error).message}`, {
						id: toastId,
					});
					return;
				}
			}
		}

		navigate({ to: "/anime", search: { q: "", filter: "all", view: "grid" } });

		importMutation.mutateAsync(files).catch((err) => {
			console.error("Import failed request", err);
		});
	};

	const toggleCandidate = (candidate: AnimeSearchResult) => {
		const newSelectedCandidates = new Set(selectedCandidateIds());
		const newSelectedFiles = new Map(selectedFiles());
		const files = scanMutation.data?.files || [];

		if (newSelectedCandidates.has(candidate.id)) {
			newSelectedCandidates.delete(candidate.id);
			files.forEach((file) => {
				const current = newSelectedFiles.get(file.source_path);
				if (current && current.anime_id === candidate.id) {
					newSelectedFiles.delete(file.source_path);
				}
			});
		} else {
			newSelectedCandidates.add(candidate.id);

			let candidateSeason = 1;
			const titleLower = (
				candidate.title.english ||
				candidate.title.romaji ||
				""
			).toLowerCase();

			const seasonMatch =
				titleLower.match(/season\s+(\d+)/) ||
				titleLower.match(/(\d+)(?:nd|rd|th)\s+season/);

			if (seasonMatch) {
				candidateSeason = Number.parseInt(seasonMatch[1], 10);
			}

			files.forEach((file) => {
				const fileSeason = file.season || 1;
				const currentSelection = newSelectedFiles.get(file.source_path);

				let shouldSelect = false;

				if (candidateSeason > 1) {
					if (fileSeason === candidateSeason) {
						shouldSelect = true;
					} else if (fileSeason === 1 && !currentSelection) {
						shouldSelect = true;
					}
				} else {
					if (!currentSelection) {
						shouldSelect = true;
					}
				}

				if (shouldSelect) {
					newSelectedFiles.set(file.source_path, {
						source_path: file.source_path,
						anime_id: candidate.id,
						episode_number: Math.floor(file.episode_number),
						season: file.season,
					});
				}
			});
		}

		setSelectedCandidateIds(newSelectedCandidates);
		setSelectedFiles(newSelectedFiles);
	};

	const toggleFile = (file: ScannedFile, targetAnimeId: number) => {
		const newSelected = new Map(selectedFiles());
		if (newSelected.has(file.source_path)) {
			newSelected.delete(file.source_path);
		} else {
			newSelected.set(file.source_path, {
				source_path: file.source_path,
				anime_id: targetAnimeId,
				episode_number: Math.floor(file.episode_number),
				season: file.season,
			});
		}
		setSelectedFiles(newSelected);
	};

	const updateFileAnime = (file: ScannedFile, newAnimeId: number) => {
		const newSelected = new Map(selectedFiles());
		if (newSelected.has(file.source_path)) {
			const existing = newSelected.get(file.source_path);
			if (existing) {
				newSelected.set(file.source_path, {
					...existing,
					anime_id: newAnimeId,
				});
			}
			setSelectedFiles(newSelected);
		}
	};

	const updateFileMapping = (
		file: ScannedFile,
		season: number,
		episode: number,
	) => {
		const newSelected = new Map(selectedFiles());
		const current = newSelected.get(file.source_path) || {
			source_path: file.source_path,
			anime_id: file.matched_anime?.id || 0,
			episode_number: Math.floor(file.episode_number),
			season: file.season,
		};

		newSelected.set(file.source_path, {
			...current,
			season,
			episode_number: episode,
		});
		setSelectedFiles(newSelected);
	};

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	};

	const handleDragLeave = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);

		const items = e.dataTransfer?.items;
		if (items && items.length > 0) {
			const item = items[0];
			if (item.kind === "file") {
				const file = item.getAsFile();
				if (file) {
					const droppedPath = (file as File & { path?: string }).path;
					if (droppedPath) {
						setPath(droppedPath);
						setInputMode("manual");
					}
				}
			}
		}

		const textData = e.dataTransfer?.getData("text/plain");
		if (
			textData &&
			(textData.startsWith("/") || textData.startsWith("file://"))
		) {
			const cleanPath = textData.replace("file://", "");
			setPath(cleanPath);
			setInputMode("manual");
		}
	};

	const currentStepIndex = () => steps.findIndex((s) => s.id === step());

	return (
		<div class="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
			{/* Top Header Bar */}
			<div class="shrink-0 border-b bg-muted/30 px-6 py-4">
				<div class="flex items-center justify-between">
					{/* Left: Back + Title */}
					<div class="flex items-center gap-4">
						<Link to="/anime" search={{ q: "", filter: "all", view: "grid" }}>
							<Button variant="ghost" size="icon" class="h-8 w-8">
								<IconArrowLeft class="h-4 w-4" />
							</Button>
						</Link>
						<div>
							<h1 class="text-lg font-semibold tracking-tight">Import Files</h1>
							<Show when={step() === "review" && path()}>
								<div class="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
									<IconFolderOpen class="h-3 w-3" />
									<span class="font-mono truncate max-w-md">{path()}</span>
								</div>
							</Show>
						</div>
					</div>

					{/* Right: Step Indicator */}
					<div class="flex items-center gap-2">
						<For each={steps}>
							{(s, index) => (
								<div class="flex items-center gap-2">
									<button
										type="button"
										onClick={() => {
											if (index() < currentStepIndex()) setStep(s.id);
										}}
										disabled={index() > currentStepIndex()}
										class={cn(
											"flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
											step() === s.id
												? "bg-primary text-primary-foreground"
												: index() < currentStepIndex()
													? "text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
													: "text-muted-foreground/50 cursor-not-allowed",
										)}
									>
										<span
											class={cn(
												"flex items-center justify-center h-5 w-5 rounded-full text-xs",
												step() === s.id
													? "bg-primary-foreground/20"
													: index() < currentStepIndex()
														? "bg-green-500/20 text-green-600"
														: "bg-muted-foreground/10",
											)}
										>
											<Show
												when={index() < currentStepIndex()}
												fallback={index() + 1}
											>
												<IconCheck class="h-3 w-3" />
											</Show>
										</span>
										{s.label}
									</button>
									<Show when={index() < steps.length - 1}>
										<div
											class={cn(
												"h-px w-6",
												index() < currentStepIndex()
													? "bg-primary"
													: "bg-border",
											)}
										/>
									</Show>
								</div>
							)}
						</For>
					</div>
				</div>
			</div>

			{/* Main Content Area */}
			<div class="flex-1 min-h-0 flex flex-col overflow-hidden">
				<Show when={step() === "scan"}>
					<div class="h-full flex flex-col overflow-hidden">
						{/* Header */}
						<div class="px-8 py-6 border-b">
							<h2 class="text-lg font-semibold">Select a folder</h2>
							<p class="text-sm text-muted-foreground mt-1">
								Choose a folder containing video files to import. Files will be
								renamed and organized according to your naming format.
							</p>
						</div>

						{/* Content */}
						<div class="flex-1 px-8 py-6 overflow-hidden flex flex-col min-h-0">
							<Tabs
								value={inputMode()}
								onChange={(v) => setInputMode(v as "browser" | "manual")}
								class="flex-1 flex flex-col min-h-0 overflow-hidden"
							>
								<TabsList class="w-fit">
									<TabsTrigger value="browser" class="gap-2">
										<IconListTree class="h-4 w-4" />
										Browse
									</TabsTrigger>
									<TabsTrigger value="manual" class="gap-2">
										<IconTypography class="h-4 w-4" />
										Manual Path
									</TabsTrigger>
								</TabsList>

								<TabsContent
									value="browser"
									class="flex-1 mt-6 min-h-0 overflow-hidden"
								>
									<div class="h-full border rounded-lg overflow-hidden bg-background">
										<Suspense
											fallback={
												<div class="h-full flex items-center justify-center">
													<IconLoader2 class="h-6 w-6 animate-spin text-muted-foreground" />
												</div>
											}
										>
											<FileBrowser
												onSelect={(selectedPath) => setPath(selectedPath)}
												directoryOnly={true}
												height="100%"
											/>
										</Suspense>
									</div>
								</TabsContent>

								<TabsContent
									value="manual"
									class="flex-1 mt-6 min-h-0 overflow-auto"
								>
									{/* biome-ignore lint/a11y/noStaticElementInteractions: dnd */}
									<div
										class={cn(
											"h-full min-h-[300px] border-2 border-dashed rounded-lg p-8 transition-colors flex flex-col items-center justify-center",
											isDragOver()
												? "border-primary bg-primary/5"
												: "border-muted-foreground/20 hover:border-muted-foreground/40",
										)}
										onDragOver={handleDragOver}
										onDragLeave={handleDragLeave}
										onDrop={handleDrop}
									>
										<div class="rounded-full bg-muted p-4 mb-4">
											<IconUpload class="h-8 w-8 text-muted-foreground" />
										</div>
										<p class="font-medium text-center">
											Drag and drop a folder here
										</p>
										<p class="text-sm text-muted-foreground mt-1 text-center">
											or enter the path manually below
										</p>
										<div class="w-full max-w-lg mt-6 space-y-2">
											<TextField value={path()} onChange={setPath}>
												<TextFieldLabel>Folder Path</TextFieldLabel>
												<TextFieldInput
													placeholder="/path/to/videos"
													class="font-mono text-sm"
												/>
											</TextField>
											<p class="text-xs text-muted-foreground">
												Supported formats: mkv, mp4, avi, webm, m4v
											</p>
										</div>
									</div>
								</TabsContent>
							</Tabs>
						</div>

						{/* Footer */}
						<div class="px-8 py-4 border-t bg-muted/30">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<Show when={path()}>
										<IconFolderOpen class="h-4 w-4 text-muted-foreground" />
										<span class="text-sm font-mono text-muted-foreground truncate max-w-md">
											{path()}
										</span>
										<Button
											variant="ghost"
											size="icon"
											class="h-6 w-6"
											onClick={() => setPath("")}
										>
											<IconX class="h-3 w-3" />
										</Button>
									</Show>
								</div>
								<Button
									onClick={handleScan}
									disabled={!path() || scanMutation.isPending}
								>
									<Show
										when={!scanMutation.isPending}
										fallback={
											<>
												<IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
												Scanning...
											</>
										}
									>
										<IconSearch class="mr-2 h-4 w-4" />
										Scan Folder
									</Show>
								</Button>
							</div>
						</div>
					</div>
				</Show>

				<Show when={step() === "review"}>
					<div class="h-full flex flex-col overflow-hidden">
						{/* Header */}
						<div class="px-8 py-6 border-b">
							<div class="flex items-center justify-between">
								<div>
									<h2 class="text-lg font-semibold">Review files</h2>
									<p class="text-sm text-muted-foreground mt-1">
										Found {scannedFiles().length} file(s)
										<Show when={skippedFiles().length > 0}>
											<span class="text-yellow-600 dark:text-yellow-500">
												{" "}
												• {skippedFiles().length} skipped
											</span>
										</Show>
									</p>
								</div>
								<Badge variant="secondary" class="text-sm">
									{selectedFiles().size} selected
								</Badge>
							</div>
						</div>

						{/* Content */}
						<div class="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
							{/* Candidates Section */}
							<div class="px-8 py-6 border-b bg-muted/20">
								<div class="flex items-center justify-between mb-4">
									<h3 class="text-sm font-medium flex items-center gap-2">
										<IconListTree class="h-4 w-4 text-primary" />
										Suggested Series
									</h3>
									<Dialog open={isSearchOpen()} onOpenChange={setIsSearchOpen}>
										<DialogTrigger
											as={Button}
											variant="outline"
											size="sm"
											class="h-7 text-xs gap-1.5"
										>
											<IconPlus class="h-3.5 w-3.5" />
											Add Series
										</DialogTrigger>
										<DialogContent class="sm:max-w-[500px]">
											<DialogHeader>
												<DialogTitle>Search Anime</DialogTitle>
												<DialogDescription>
													Search for the series to match your files against.
												</DialogDescription>
											</DialogHeader>
											<div class="py-4">
												<ManualSearch
													onSelect={handleManualAdd}
													existingIds={new Set(candidates().map((c) => c.id))}
												/>
											</div>
										</DialogContent>
									</Dialog>
								</div>

								<Show
									when={candidates().length > 0}
									fallback={
										<div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
											<p class="text-sm">No series suggestions found.</p>
											<p class="text-xs mt-1">Try adding one manually.</p>
										</div>
									}
								>
									<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
										<For each={candidates()}>
											{(candidate) => {
												const isLocal = () =>
													animeListQuery.data?.some(
														(a) => a.id === candidate.id,
													);
												const isSelected = () =>
													selectedCandidateIds().has(candidate.id);
												const isManual = () =>
													manualCandidates().some((c) => c.id === candidate.id);

												return (
													<button
														type="button"
														class={cn(
															"relative flex gap-3 p-3 rounded-lg border transition-all text-left hover:shadow-sm",
															isSelected()
																? "border-primary bg-primary/5 ring-1 ring-primary/20"
																: "border-border bg-background hover:border-primary/50",
														)}
														onClick={() => toggleCandidate(candidate)}
													>
														<div class="shrink-0 relative w-10 h-14 rounded overflow-hidden bg-muted">
															<Show
																when={candidate.cover_image}
																fallback={
																	<div class="w-full h-full flex items-center justify-center">
																		<IconFile class="h-4 w-4 text-muted-foreground/50" />
																	</div>
																}
															>
																<img
																	src={candidate.cover_image}
																	alt={candidate.title.romaji}
																	class="w-full h-full object-cover"
																/>
															</Show>
															<Show when={isSelected()}>
																<div class="absolute inset-0 bg-primary/40 flex items-center justify-center">
																	<IconCheck class="h-4 w-4 text-white" />
																</div>
															</Show>
														</div>
														<div class="flex-1 min-w-0">
															<Tooltip>
																<TooltipTrigger>
																	<span class="font-medium text-sm line-clamp-2 leading-tight block">
																		{candidate.title.romaji}
																	</span>
																</TooltipTrigger>
																<TooltipContent>
																	{candidate.title.romaji}
																</TooltipContent>
															</Tooltip>
															<div class="flex items-center gap-1.5 mt-1">
																<Show when={!isLocal()}>
																	<Badge
																		variant="secondary"
																		class="h-4 px-1 text-[9px] bg-blue-500/10 text-blue-500"
																	>
																		New
																	</Badge>
																</Show>
																<Show when={isManual()}>
																	<Badge
																		variant="secondary"
																		class="h-4 px-1 text-[9px] bg-purple-500/10 text-purple-500"
																	>
																		Manual
																	</Badge>
																</Show>
																<span class="text-[10px] text-muted-foreground font-mono">
																	{candidate.id}
																</span>
															</div>
														</div>
													</button>
												);
											}}
										</For>
									</div>
								</Show>
							</div>

							{/* File List */}
							<div class="divide-y">
								<For each={scannedFiles()}>
									{(file) => (
										<FileRow
											file={file}
											animeList={animeListQuery.data || []}
											candidates={candidates()}
											isSelected={selectedFiles().has(file.source_path)}
											selectedAnimeId={
												selectedFiles().get(file.source_path)?.anime_id
											}
											currentEpisode={
												selectedFiles().get(file.source_path)?.episode_number
											}
											currentSeason={
												selectedFiles().get(file.source_path)?.season
											}
											onToggle={(id) => toggleFile(file, id)}
											onAnimeChange={(id) => updateFileAnime(file, id)}
											onMappingChange={(s, e) => updateFileMapping(file, s, e)}
										/>
									)}
								</For>
							</div>
						</div>

						{/* Footer */}
						<div class="px-8 py-4 border-t bg-muted/30">
							<div class="flex items-center justify-between">
								<Button variant="ghost" onClick={() => setStep("scan")}>
									<IconArrowLeft class="mr-2 h-4 w-4" />
									Back
								</Button>
								<Button
									onClick={handleImport}
									disabled={
										selectedFiles().size === 0 || importMutation.isPending
									}
								>
									<Show
										when={!importMutation.isPending}
										fallback={
											<>
												<IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
												Importing...
											</>
										}
									>
										Import {selectedFiles().size} File
										{selectedFiles().size !== 1 ? "s" : ""}
										<IconArrowRight class="ml-2 h-4 w-4" />
									</Show>
								</Button>
							</div>
						</div>
					</div>
				</Show>
			</div>
		</div>
	);
}

interface FileRowProps {
	file: ScannedFile;
	animeList: { id: number; title: { romaji: string; english?: string } }[];
	candidates: AnimeSearchResult[];
	isSelected: boolean;
	selectedAnimeId?: number;
	currentEpisode?: number;
	currentSeason?: number | null;
	onToggle: (animeId: number) => void;
	onAnimeChange: (animeId: number) => void;
	onMappingChange: (season: number, episode: number) => void;
}

function FileRow(props: FileRowProps) {
	const matchedAnimeId = () =>
		props.file.matched_anime?.id || props.selectedAnimeId;
	const hasMatch = () => !!matchedAnimeId();

	const displayEpisode = () =>
		props.currentEpisode !== undefined
			? props.currentEpisode
			: Math.floor(props.file.episode_number);
	const displaySeason = () =>
		props.currentSeason !== undefined ? props.currentSeason : props.file.season;

	const allOptions = createMemo(() => {
		return [
			...props.animeList.map((a) => ({ ...a, source: "library" as const })),
			...props.candidates
				.filter((c) => !props.animeList.some((a) => a.id === c.id))
				.map((c) => ({ ...c, source: "candidate" as const })),
		].sort((a, b) => {
			const titleA = a.title.english || a.title.romaji || "";
			const titleB = b.title.english || b.title.romaji || "";
			return titleA.localeCompare(titleB);
		});
	});

	return (
		<div
			class={cn(
				"px-8 py-3 transition-colors",
				props.isSelected ? "bg-primary/5" : "hover:bg-muted/50",
			)}
		>
			<div class="flex items-center gap-4 min-w-0">
				<Checkbox
					checked={props.isSelected}
					disabled={!hasMatch()}
					onChange={(checked) => {
						const id = matchedAnimeId();
						if (checked && id) {
							props.onToggle(id);
						} else if (!checked && id) {
							props.onToggle(id);
						}
					}}
					class="shrink-0"
				/>
				<IconFile class="h-4 w-4 text-muted-foreground shrink-0" />
				<div class="flex-1 min-w-0 overflow-hidden">
					<span class="text-sm font-medium truncate block">
						{props.file.filename}
					</span>
				</div>
				<div class="flex items-center gap-1.5 shrink-0">
					<EditMappingPopover
						episode={displayEpisode()}
						season={displaySeason()}
						onSave={props.onMappingChange}
					/>
					<Show when={props.file.resolution}>
						<Badge variant="secondary" class="text-xs">
							{props.file.resolution}
						</Badge>
					</Show>
				</div>
				<div class="flex items-center gap-2 shrink-0 w-64">
					<Show
						when={hasMatch()}
						fallback={
							<>
								<IconAlertTriangle class="h-4 w-4 text-yellow-600 shrink-0" />
								<Select
									value={null}
									onChange={(v) => {
										if (v) {
											const newId = v.id;
											props.onToggle(newId);
										}
									}}
									options={allOptions()}
									optionValue="id"
									optionTextValue={(opt) =>
										opt.title.english || opt.title.romaji || "Unknown Title"
									}
									placeholder="Select anime..."
									itemComponent={(props) => (
										<SelectItem item={props.item}>
											<span class="flex items-center gap-2">
												{props.item.rawValue?.title.english ||
													props.item.rawValue?.title.romaji}
												<Show
													when={props.item.rawValue?.source === "candidate"}
												>
													<Badge
														variant="secondary"
														class="h-4 px-1 text-[9px]"
													>
														New
													</Badge>
												</Show>
											</span>
										</SelectItem>
									)}
								>
									<SelectTrigger class="h-8 text-xs flex-1">
										{/* biome-ignore lint/suspicious/noExplicitAny: complex type */}
										<SelectValue<any>>
											{(_state) => (
												<span class="text-muted-foreground">
													Select anime...
												</span>
											)}
										</SelectValue>
									</SelectTrigger>
									<SelectContent />
								</Select>
							</>
						}
					>
						<IconCheck class="h-4 w-4 text-green-600 shrink-0" />
						<Select
							value={allOptions().find(
								(o) => o.id === (props.selectedAnimeId || matchedAnimeId()),
							)}
							onChange={(v) => {
								if (v) {
									const newId = v.id;
									props.onAnimeChange(newId);
									if (!props.isSelected) {
										props.onToggle(newId);
									}
								}
							}}
							options={allOptions()}
							optionValue="id"
							optionTextValue={(opt) =>
								opt.title.english || opt.title.romaji || "Unknown Title"
							}
							itemComponent={(props) => (
								<SelectItem item={props.item}>
									<span class="flex items-center gap-2">
										{props.item.rawValue?.title.english ||
											props.item.rawValue?.title.romaji}
										<Show when={props.item.rawValue?.source === "candidate"}>
											<Badge variant="secondary" class="h-4 px-1 text-[9px]">
												New
											</Badge>
										</Show>
									</span>
								</SelectItem>
							)}
						>
							<SelectTrigger class="h-8 text-xs flex-1">
								{/* biome-ignore lint/suspicious/noExplicitAny: complex type */}
								<SelectValue<any>>
									{(state) =>
										state.selectedOption()?.title.english ||
										state.selectedOption()?.title.romaji ||
										`ID: ${props.selectedAnimeId || matchedAnimeId()}`
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent />
						</Select>
					</Show>
				</div>
			</div>
		</div>
	);
}

function ManualSearch(props: {
	onSelect: (candidate: AnimeSearchResult) => void;
	existingIds: Set<number>;
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
