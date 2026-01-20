import {
	IconAlertTriangle,
	IconDownload,
	IconLoader2,
	IconPlug,
	IconVideo,
} from "@tabler/icons-solidjs";
import { formatDistanceToNow } from "date-fns";
import { createEffect, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	createEpisodeSearchQuery,
	createGrabReleaseMutation,
	type DownloadAction,
	type EpisodeSearchResult,
} from "~/lib/api";
import { cn } from "~/lib/utils";

interface SearchModalProps {
	animeId: number;
	episodeNumber: number;
	episodeTitle?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SearchModal(props: SearchModalProps) {
	const searchQuery = createEpisodeSearchQuery(
		() => props.animeId,
		() => props.episodeNumber,
	);

	const grabRelease = createGrabReleaseMutation();

	createEffect(() => {
		if (props.open) {
			searchQuery.refetch();
		}
	});

	const handleDownload = (release: EpisodeSearchResult) => {
		grabRelease.mutate(
			{
				anime_id: props.animeId,
				episode_number: props.episodeNumber,
				title: release.title,
				magnet: release.link,
				group: release.group,
				info_hash: release.info_hash,
			},
			{
				onSuccess: () => {
					props.onOpenChange(false);
					toast.success("Download started");
				},
				onError: (err) => {
					toast.error("Failed to queue download", {
						description: (err as Error).message,
					});
				},
			},
		);
	};

	const formatSize = (bytes: number) => {
		if (bytes === 0) return "N/A";
		const units = ["B", "KB", "MB", "GB", "TB"];
		let size = bytes;
		let unitIndex = 0;
		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}
		return `${size.toFixed(1)} ${units[unitIndex]}`;
	};

	const getActionReason = (action: DownloadAction) => {
		if (action.Reject) return action.Reject.reason;
		if (action.Upgrade) return action.Upgrade.reason;
		return null;
	};

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="sm:max-w-7xl w-full max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Manual Search</DialogTitle>
					<DialogDescription>
						Searching for Episode {props.episodeNumber}
						<Show when={props.episodeTitle}> - {props.episodeTitle}</Show>
					</DialogDescription>
				</DialogHeader>

				<div class="flex-1 overflow-hidden min-h-[200px] flex flex-col">
					<Show
						when={!searchQuery.isLoading}
						fallback={
							<div class="h-full flex flex-col items-center justify-center gap-4 py-8">
								<IconLoader2 class="h-8 w-8 animate-spin text-muted-foreground" />
								<p class="text-muted-foreground">Searching releases...</p>
							</div>
						}
					>
						<Show
							when={!searchQuery.error}
							fallback={
								<div class="flex flex-col items-center justify-center flex-1 text-red-500 gap-2">
									<IconAlertTriangle class="h-8 w-8" />
									<p>Error searching for releases</p>
									<p class="text-sm text-muted-foreground">
										{(searchQuery.error as Error).message}
									</p>
									<Button
										variant="outline"
										size="sm"
										onClick={() => searchQuery.refetch()}
										class="mt-2"
									>
										Retry
									</Button>
								</div>
							}
						>
							<Show
								when={searchQuery.data && searchQuery.data.length > 0}
								fallback={
									<div class="flex flex-col items-center justify-center flex-1 text-muted-foreground">
										<IconVideo class="h-12 w-12 opacity-20" />
										<p class="mt-2">No releases found</p>
									</div>
								}
							>
								<div class="flex-1 border rounded-md overflow-auto">
									<Table>
										<TableHeader class="bg-muted/50 sticky top-0 z-10 shadow-sm">
											<TableRow>
												<TableHead>Release</TableHead>
												<TableHead class="w-[100px]">Indexer</TableHead>
												<TableHead class="w-[80px]">Size</TableHead>
												<TableHead class="w-[80px]">Peers</TableHead>
												<TableHead class="w-[120px]">Profile</TableHead>
												<TableHead class="w-[100px]">Action</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											<For each={searchQuery.data}>
												{(release) => {
													const action = release.download_action;
													const isRejected = !!action.Reject;
													const reason = getActionReason(action);

													return (
														<TableRow
															class={cn(
																"group",
																isRejected && "opacity-60 bg-muted/20",
															)}
														>
															<TableCell class="font-medium max-w-[300px]">
																<div class="flex flex-col gap-1">
																	<span
																		class="line-clamp-2 text-sm break-all"
																		title={release.title}
																	>
																		{release.title}
																	</span>
																	<div class="flex items-center gap-2 text-xs text-muted-foreground">
																		<span class="flex items-center gap-1">
																			{formatDistanceToNow(
																				new Date(release.publish_date),
																				{ addSuffix: true },
																			)}
																		</span>
																		<Show when={release.group}>
																			<Badge
																				variant="outline"
																				class="text-[10px] px-1 h-4"
																			>
																				{release.group}
																			</Badge>
																		</Show>
																	</div>
																</div>
															</TableCell>
															<TableCell class="text-xs">
																{release.indexer}
															</TableCell>
															<TableCell class="text-xs font-mono">
																{formatSize(release.size)}
															</TableCell>
															<TableCell class="text-xs">
																<span class="text-green-500 font-medium">
																	{release.seeders}
																</span>
																{" / "}
																<span class="text-red-500">
																	{release.leechers}
																</span>
															</TableCell>
															<TableCell>
																<div class="flex flex-col gap-1">
																	<Badge
																		variant="secondary"
																		class="w-fit text-[10px]"
																	>
																		{release.quality}
																	</Badge>
																</div>
															</TableCell>
															<TableCell>
																<div class="flex flex-col gap-1 items-end">
																	<Button
																		size="sm"
																		variant={isRejected ? "ghost" : "default"}
																		class={cn(
																			"h-7 w-full gap-1 text-xs",
																			action.Accept &&
																				"bg-green-600 hover:bg-green-700 text-white",
																			action.Upgrade &&
																				"bg-blue-600 hover:bg-blue-700 text-white",
																			isRejected &&
																				"text-muted-foreground border",
																		)}
																		onClick={() => handleDownload(release)}
																		disabled={grabRelease.isPending}
																	>
																		<Show
																			when={!grabRelease.isPending}
																			fallback={
																				<IconPlug class="h-3 w-3 animate-spin" />
																			}
																		>
																			<IconDownload class="h-3.5 w-3.5" />
																		</Show>
																		{isRejected ? "Force" : "Grab"}
																	</Button>
																	<Show when={reason}>
																		<span
																			class="text-[10px] text-red-500 text-right leading-tight max-w-[100px]"
																			title={reason || ""}
																		>
																			{reason}
																		</span>
																	</Show>
																</div>
															</TableCell>
														</TableRow>
													);
												}}
											</For>
										</TableBody>
									</Table>
								</div>
							</Show>
						</Show>
					</Show>
				</div>
			</DialogContent>
		</Dialog>
	);
}
