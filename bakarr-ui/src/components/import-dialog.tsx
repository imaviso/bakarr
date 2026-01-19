import {
	IconAlertTriangle,
	IconArrowLeft,
	IconArrowRight,
	IconCheck,
	IconDeviceFloppy,
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
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	Show,
} from "solid-js";
import { toast } from "solid-sonner";
import { EditMappingPopover } from "~/components/edit-mapping-popover";
import { FileBrowser } from "~/components/file-browser";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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
	createAddAnimeMutation,
	createAnimeListQuery,
	createAnimeSearchQuery,
	createImportFilesMutation,
	createProfilesQuery,
	createScanImportPathMutation,
	type ImportFileRequest,
	type ScannedFile,
} from "~/lib/api";
import { cn } from "~/lib/utils";

interface ImportDialogProps {
	trigger?: any;
	animeId?: number;
	tooltip?: string;
}

export function ImportDialog(props: ImportDialogProps) {
	const [open, setOpen] = createSignal(false);
	const [path, setPath] = createSignal("");
	const [step, setStep] = createSignal<"scan" | "review" | "result">("scan");
	const [selectedFiles, setSelectedFiles] = createSignal<
		Map<string, ImportFileRequest>
	>(new Map());
	const [inputMode, setInputMode] = createSignal<"browser" | "manual">(
		"browser",
	);
	const [isDragOver, setIsDragOver] = createSignal(false);

	const [selectedCandidateIds, setSelectedCandidateIds] = createSignal<
		Set<number>
	>(new Set());
	const [manualCandidates, setManualCandidates] = createSignal<
		AnimeSearchResult[]
	>([]);
	const [isSearchOpen, setIsSearchOpen] = createSignal(false);

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

	const candidates = createMemo(() => [
		...(scanMutation.data?.candidates || []),
		...manualCandidates().filter(
			(mc) => !scanMutation.data?.candidates.some((c) => c.id === mc.id),
		),
	]);

	const resetDialog = () => {
		setStep("scan");
		setPath("");
		setSelectedFiles(new Map());
		setSelectedCandidateIds(new Set<number>());
		setManualCandidates([]);
	};

	createEffect(() => {
		if (!open()) {
			resetDialog();
		}
	});

	const handleManualAdd = (candidate: AnimeSearchResult) => {
		setManualCandidates((prev) => [...prev, candidate]);
		setIsSearchOpen(false);
		setSelectedCandidateIds((prev) => {
			const next = new Set(prev);
			next.add(candidate.id);
			return next;
		});
		toggleCandidate(candidate, true);
	};

	const handleScan = () => {
		scanMutation.mutate(
			{ path: path(), anime_id: props.animeId },
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

	const toggleCandidate = (
		candidate: AnimeSearchResult,
		forceSelect = false,
	) => {
		const newSelectedCandidates = new Set(selectedCandidateIds());
		const newSelectedFiles = new Map(selectedFiles());
		const files = scanMutation.data?.files || [];

		const isSelected = newSelectedCandidates.has(candidate.id) && !forceSelect;

		if (isSelected) {
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

	const handleImport = async () => {
		const files = Array.from(selectedFiles().values());

		const uniqueAnimeIds = new Set(files.map((f) => f.anime_id));
		const localAnimeIds = new Set(animeListQuery.data?.map((a) => a.id));
		const newAnimeIds = Array.from(uniqueAnimeIds).filter(
			(id) => !localAnimeIds.has(id),
		);

		if (newAnimeIds.length > 0) {
			const candidate = candidates().find((c) => c.id === newAnimeIds[0]);
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

		setOpen(false);

		const toastId = toast.loading(`Importing ${files.length} file(s)...`);
		importMutation
			.mutateAsync(files)
			.then((data) => {
				const imported = data?.imported || 0;
				const failed = data?.failed || 0;
				if (failed > 0) {
					toast.warning(`Imported ${imported} file(s), ${failed} failed`, {
						id: toastId,
					});
				} else {
					toast.success(`Successfully imported ${imported} file(s)`, {
						id: toastId,
					});
				}
			})
			.catch((err) => {
				toast.error(`Import failed: ${err.message}`, { id: toastId });
			});
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
			setPath(textData.replace("file://", ""));
			setInputMode("manual");
		}
	};

	return (
		<Dialog open={open()} onOpenChange={setOpen}>
			<DialogTrigger as="div" class="contents">
				<Show
					when={props.tooltip}
					fallback={
						props.trigger || (
							<Button variant="outline">
								<IconFolderOpen class="mr-2 h-4 w-4" />
								Import Files
							</Button>
						)
					}
				>
					<Tooltip>
						<TooltipTrigger>
							{props.trigger || (
								<Button variant="outline">
									<IconFolderOpen class="mr-2 h-4 w-4" />
									Import Files
								</Button>
							)}
						</TooltipTrigger>
						<TooltipContent>{props.tooltip}</TooltipContent>
					</Tooltip>
				</Show>
			</DialogTrigger>

			<DialogContent class="max-w-6xl w-full max-h-[85vh] flex flex-col overflow-hidden">
				<Show when={step() === "scan"}>
					<DialogHeader>
						<DialogTitle>Import Video Files</DialogTitle>
						<DialogDescription>
							Select a folder containing video files to import into your
							library.
						</DialogDescription>
					</DialogHeader>
					<div class="space-y-4 py-4 flex-1 min-h-0 flex flex-col">
						<Tabs
							value={inputMode()}
							onChange={(v) => setInputMode(v as any)}
							class="flex-1 flex flex-col min-h-0"
						>
							<TabsList class="grid w-full grid-cols-2">
								<TabsTrigger value="browser">
									<IconListTree class="mr-2 h-4 w-4" />
									Browse
								</TabsTrigger>
								<TabsTrigger value="manual">
									<IconTypography class="mr-2 h-4 w-4" />
									Manual Path
								</TabsTrigger>
							</TabsList>
							<TabsContent value="browser" class="mt-4 flex-1 min-h-0">
								<div class="h-[280px] border rounded-lg overflow-hidden bg-background">
									<FileBrowser
										onSelect={(p) => setPath(p)}
										directoryOnly={true}
										height="100%"
									/>
								</div>
							</TabsContent>
							<TabsContent value="manual" class="mt-4 flex-1">
								<div
									class={cn(
										"border-2 border-dashed rounded-lg p-6 transition-colors h-full flex flex-col items-center justify-center",
										isDragOver()
											? "border-primary bg-primary/5"
											: "border-muted-foreground/25",
									)}
									onDragOver={handleDragOver}
									onDragLeave={handleDragLeave}
									onDrop={handleDrop}
								>
									<div class="flex flex-col items-center gap-4">
										<div class="rounded-full bg-muted p-3">
											<IconUpload class="h-6 w-6 text-muted-foreground" />
										</div>
										<div class="text-center">
											<p class="text-sm font-medium">
												Drag and drop a folder here
											</p>
											<p class="text-xs text-muted-foreground mt-1">
												or enter path below
											</p>
										</div>
										<div class="w-full space-y-2">
											<TextField value={path()} onChange={setPath}>
												<TextFieldLabel>Folder Path</TextFieldLabel>
												<TextFieldInput
													placeholder="/path/to/videos"
													class="font-mono text-sm"
												/>
											</TextField>
										</div>
									</div>
								</div>
							</TabsContent>
						</Tabs>

						<Show when={path()}>
							<div class="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
								<IconFolderOpen class="h-4 w-4 text-muted-foreground shrink-0" />
								<span class="text-sm font-mono truncate flex-1">{path()}</span>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setPath("")}
									class="shrink-0 h-6 w-6"
								>
									<IconX class="h-3 w-3" />
								</Button>
							</div>
						</Show>
					</div>
					<DialogFooter>
						<Button
							onClick={handleScan}
							disabled={!path() || scanMutation.isPending}
						>
							<Show
								when={scanMutation.isPending}
								fallback={
									<>
										<IconSearch class="mr-2 h-4 w-4" />
										Scan Folder
									</>
								}
							>
								<IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
								Scanning...
							</Show>
						</Button>
					</DialogFooter>
				</Show>

				<Show when={step() === "review"}>
					<DialogHeader>
						<DialogTitle>Review Files</DialogTitle>
						<DialogDescription>
							Found {scannedFiles().length} file(s). Select files to import.
							<Show when={skippedFiles().length > 0}>
								<span class="text-yellow-600">
									{" "}
									({skippedFiles().length} skipped)
								</span>
							</Show>
						</DialogDescription>
					</DialogHeader>

					<div class="flex-1 min-h-0 overflow-y-auto px-1">
						{/* Candidates */}
						<div class="bg-muted/30 p-4 rounded-lg border mb-4">
							<div class="flex items-center justify-between mb-3">
								<h4 class="text-sm font-medium flex items-center gap-2">
									<IconListTree class="h-4 w-4 text-primary" />
									Suggested Series
								</h4>
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

							<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
								<For each={candidates()}>
									{(candidate) => (
										<CandidateCard
											candidate={candidate}
											isSelected={selectedCandidateIds().has(candidate.id)}
											isLocal={
												animeListQuery.data?.some(
													(a) => a.id === candidate.id,
												) || false
											}
											isManual={manualCandidates().some(
												(c) => c.id === candidate.id,
											)}
											onToggle={() => toggleCandidate(candidate)}
										/>
									)}
								</For>
							</div>
						</div>

						{/* File List */}
						<div class="divide-y border rounded-lg">
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

					<DialogFooter class="flex-row justify-between sm:justify-between">
						<Button variant="outline" onClick={() => setStep("scan")}>
							Back
						</Button>
						<div class="flex items-center gap-2">
							<span class="text-sm text-muted-foreground">
								{selectedFiles().size} selected
							</span>
							<Button
								onClick={handleImport}
								disabled={
									selectedFiles().size === 0 || importMutation.isPending
								}
							>
								<Show
									when={importMutation.isPending}
									fallback={
										<>
											<IconArrowRight class="mr-2 h-4 w-4" />
											Import Selected
										</>
									}
								>
									<IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
									Importing...
								</Show>
							</Button>
						</div>
					</DialogFooter>
				</Show>
			</DialogContent>
		</Dialog>
	);
}

function CandidateCard(props: {
	candidate: AnimeSearchResult;
	isSelected: boolean;
	isLocal: boolean;
	isManual: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			class={cn(
				"relative group flex gap-3 p-2 rounded-lg border transition-all cursor-pointer hover:shadow-md text-left w-full",
				props.isSelected
					? "border-primary bg-primary/5 ring-1 ring-primary/20"
					: "border-border bg-card hover:border-primary/50",
			)}
			onClick={props.onToggle}
		>
			<div class="shrink-0 relative w-12 h-16 rounded overflow-hidden bg-muted shadow-sm">
				<Show
					when={props.candidate.cover_image}
					fallback={
						<div class="w-full h-full flex items-center justify-center bg-muted/50">
							<IconFile class="h-4 w-4 text-muted-foreground/50" />
						</div>
					}
				>
					<img
						src={props.candidate.cover_image}
						alt=""
						class="w-full h-full object-cover"
					/>
				</Show>
				<Show when={props.isSelected}>
					<div class="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
						<IconCheck class="h-5 w-5 text-white drop-shadow-md" />
					</div>
				</Show>
			</div>
			<div class="flex flex-col min-w-0 flex-1 justify-center gap-1">
				<Tooltip>
					<TooltipTrigger>
						<span class="font-medium text-sm leading-tight line-clamp-2">
							{props.candidate.title.romaji}
						</span>
					</TooltipTrigger>
					<TooltipContent>
						<p>{props.candidate.title.romaji}</p>
					</TooltipContent>
				</Tooltip>
				<div class="flex items-center flex-wrap gap-1.5 mt-0.5">
					<Show when={!props.isLocal}>
						<Badge
							variant="secondary"
							class="h-4 px-1 text-[9px] bg-blue-500/10 text-blue-500 border-blue-500/20"
						>
							New
						</Badge>
					</Show>
					<Show when={props.isManual}>
						<Badge
							variant="secondary"
							class="h-4 px-1 text-[9px] bg-purple-500/10 text-purple-500 border-purple-500/20"
						>
							Manual
						</Badge>
					</Show>
					<span class="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1 rounded">
						ID: {props.candidate.id}
					</span>
				</div>
			</div>
		</button>
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
		props.currentEpisode ?? Math.floor(props.file.episode_number);
	const displaySeason = () => props.currentSeason ?? props.file.season;

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
						if (id) props.onToggle(id);
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
									onChange={(v) => v && props.onToggle(v.id)}
									options={allOptions()}
									optionValue="id"
									optionTextValue={(item) =>
										item.title.english || item.title.romaji || ""
									}
									itemComponent={(props) => (
										<SelectItem item={props.item}>
											{props.item.rawValue?.title.english ||
												props.item.rawValue?.title.romaji}
										</SelectItem>
									)}
								>
									<SelectTrigger class="h-8 text-xs flex-1">
										<SelectValue<any>>{() => "Select anime..."}</SelectValue>
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
									props.onAnimeChange(v.id);
									if (!props.isSelected) props.onToggle(v.id);
								}
							}}
							options={allOptions()}
							optionValue="id"
							optionTextValue={(item) =>
								item.title.english || item.title.romaji || ""
							}
							itemComponent={(props) => (
								<SelectItem item={props.item}>
									{props.item.rawValue?.title.english ||
										props.item.rawValue?.title.romaji}
								</SelectItem>
							)}
						>
							<SelectTrigger class="h-8 text-xs flex-1">
								<SelectValue<any>>
									{(state) =>
										state.selectedOption()?.title.english ||
										state.selectedOption()?.title.romaji
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
		const t = setTimeout(() => setDebouncedQuery(query()), 500);
		onCleanup(() => clearTimeout(t));
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
