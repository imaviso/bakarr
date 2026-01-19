import {
	IconArrowUp,
	IconChevronRight,
	IconFile,
	IconFolder,
	IconFolderOpen,
	IconHome,
	IconLoader2,
} from "@tabler/icons-solidjs";
import { createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { type BrowseEntry, createBrowsePathQuery } from "~/lib/api";
import { cn } from "~/lib/utils";

interface FileBrowserProps {
	/** Callback when a path is selected */
	onSelect: (path: string) => void;
	/** Whether to only allow selecting directories */
	directoryOnly?: boolean;
	/** Initial path to start browsing from */
	initialPath?: string;
	/** Height of the browser */
	height?: string;
}

export function FileBrowser(props: FileBrowserProps) {
	const directoryOnly = () => props.directoryOnly ?? true;
	const initialPath = () => props.initialPath ?? "";
	const height = () => props.height ?? "300px";

	const [currentPath, setCurrentPath] = createSignal(initialPath());
	const [manualPath, setManualPath] = createSignal(initialPath());
	const [selectedPath, setSelectedPath] = createSignal<string | null>(null);

	const browserQuery = createBrowsePathQuery(currentPath);

	const handleNavigate = (path: string) => {
		setCurrentPath(path);
		setManualPath(path);
		setSelectedPath(null);
	};

	const handleSelect = (entry: BrowseEntry) => {
		if (entry.is_directory) {
			handleNavigate(entry.path);
		} else if (!directoryOnly()) {
			setSelectedPath(entry.path);
			props.onSelect(entry.path);
		}
	};

	const handleDirectorySelect = (entry: BrowseEntry) => {
		if (entry.is_directory) {
			setSelectedPath(entry.path);
			props.onSelect(entry.path);
		}
	};

	const handleGoUp = () => {
		const parent = browserQuery.data?.parent_path;
		if (parent !== undefined) {
			handleNavigate(parent);
		}
	};

	const handleGoHome = () => {
		handleNavigate("");
	};

	const handleManualNavigate = () => {
		setCurrentPath(manualPath());
		setSelectedPath(null);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Enter") {
			handleManualNavigate();
		}
	};

	const breadcrumbs = () => {
		const path = browserQuery.data?.current_path;
		return path && path !== "/" ? path.split("/").filter(Boolean) : [];
	};

	const isFullHeight = () => height() === "100%";

	return (
		<div
			class={cn(
				"border rounded-lg overflow-hidden bg-background",
				isFullHeight() && "h-full flex flex-col",
			)}
		>
			{/* Path input and navigation */}
			<div class="flex items-center gap-2 p-2 border-b bg-muted/30 shrink-0">
				<Button
					variant="ghost"
					size="icon"
					class="h-8 w-8"
					onClick={handleGoHome}
					title="Go to root"
				>
					<IconHome class="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="h-8 w-8"
					onClick={handleGoUp}
					disabled={!browserQuery.data?.parent_path}
					title="Go up"
				>
					<IconArrowUp class="h-4 w-4" />
				</Button>
				<div class="flex-1">
					<TextField value={manualPath()} onChange={setManualPath}>
						<TextFieldInput
							onKeyDown={handleKeyDown}
							placeholder="Enter path..."
							class="h-8 text-sm font-mono"
						/>
					</TextField>
				</div>
				<Button
					variant="secondary"
					size="sm"
					onClick={handleManualNavigate}
					disabled={browserQuery.isFetching}
				>
					<Show
						when={!browserQuery.isFetching}
						fallback={<IconLoader2 class="h-4 w-4 animate-spin" />}
					>
						Go
					</Show>
				</Button>
			</div>

			{/* Breadcrumb trail */}
			<Show when={breadcrumbs().length > 0}>
				<div class="flex items-center gap-1 px-3 py-1.5 border-b text-xs text-muted-foreground overflow-x-auto shrink-0">
					<button
						type="button"
						onClick={handleGoHome}
						class="hover:text-foreground transition-colors shrink-0"
					>
						/
					</button>
					<For each={breadcrumbs()}>
						{(part, index) => {
							const partPath = () =>
								`/${breadcrumbs()
									.slice(0, index() + 1)
									.join("/")}`;
							const isLast = () => index() === breadcrumbs().length - 1;
							return (
								<span class="flex items-center gap-1 shrink-0">
									<IconChevronRight class="h-3 w-3" />
									<button
										type="button"
										onClick={() => handleNavigate(partPath())}
										class={cn(
											"hover:text-foreground transition-colors truncate max-w-32",
											isLast() && "text-foreground font-medium",
										)}
									>
										{part}
									</button>
								</span>
							);
						}}
					</For>
				</div>
			</Show>

			{/* File listing */}
			<div
				class={cn("overflow-auto", isFullHeight() && "flex-1 min-h-0")}
				style={isFullHeight() ? undefined : { height: height() }}
			>
				{/* Show spinner when fetching new data while showing old data */}
				<Show when={browserQuery.isFetching && !browserQuery.isLoading}>
					<div class="absolute top-2 right-2 p-1 bg-background/80 rounded-full shadow-sm z-10">
						<IconLoader2 class="h-3 w-3 animate-spin text-primary" />
					</div>
				</Show>

				<Show
					when={!browserQuery.isLoading}
					fallback={
						<div class="p-3 space-y-2">
							<For each={Array.from({ length: 6 })}>
								{() => (
									<div class="flex items-center gap-2">
										<Skeleton class="h-4 w-4" />
										<Skeleton class="h-4 flex-1" />
									</div>
								)}
							</For>
						</div>
					}
				>
					<Show
						when={!browserQuery.error}
						fallback={
							<div class="p-4 text-center text-sm text-destructive">
								{browserQuery.error instanceof Error
									? browserQuery.error.message
									: "Failed to load directory"}
							</div>
						}
					>
						<Show
							when={browserQuery.data?.entries.length !== 0}
							fallback={
								<div class="p-4 text-center text-sm text-muted-foreground">
									This directory is empty
								</div>
							}
						>
							<div class="p-1">
								<For each={browserQuery.data?.entries}>
									{(entry) => (
										<FileEntry
											entry={entry}
											isSelected={selectedPath() === entry.path}
											onNavigate={() => handleSelect(entry)}
											onSelect={() => handleDirectorySelect(entry)}
											directoryOnly={directoryOnly()}
										/>
									)}
								</For>
							</div>
						</Show>
					</Show>
				</Show>
			</div>

			{/* Selected path indicator */}
			<Show when={selectedPath()}>
				<div class="px-3 py-2 border-t bg-primary/5 text-xs">
					<span class="text-muted-foreground">Selected: </span>
					<span class="font-mono text-primary">{selectedPath()}</span>
				</div>
			</Show>
		</div>
	);
}

interface FileEntryProps {
	entry: BrowseEntry;
	isSelected: boolean;
	onNavigate: () => void;
	onSelect: () => void;
	directoryOnly: boolean;
}

function FileEntry(props: FileEntryProps) {
	const formatSize = (bytes?: number) => {
		if (!bytes) return "";
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024)
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	};

	return (
		<button
			type="button"
			class={cn(
				"flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors group w-full text-left",
				props.isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
			)}
			onClick={props.onSelect}
			onDblClick={props.onNavigate}
			title={
				props.entry.is_directory
					? "Double-click to open, click to select"
					: props.entry.path
			}
		>
			<Show
				when={props.entry.is_directory}
				fallback={<IconFile class="h-4 w-4 text-muted-foreground shrink-0" />}
			>
				<Show
					when={props.isSelected}
					fallback={
						<IconFolder class="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
					}
				>
					<IconFolderOpen class="h-4 w-4 text-primary shrink-0" />
				</Show>
			</Show>
			<span class="text-sm truncate flex-1">{props.entry.name}</span>
			<Show when={!props.entry.is_directory && props.entry.size}>
				<span class="text-xs text-muted-foreground shrink-0">
					{formatSize(props.entry.size)}
				</span>
			</Show>
			<Show when={props.entry.is_directory}>
				<IconChevronRight class="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
			</Show>
		</button>
	);
}
