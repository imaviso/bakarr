import {
	IconAlertTriangle,
	IconArrowDown,
	IconCheck,
	IconClock,
	IconDownload,
	IconPlayerPause,
	IconSearch,
	IconX,
} from "@tabler/icons-solidjs";
import { createFileRoute } from "@tanstack/solid-router";
import { For, Show } from "solid-js";
import { GeneralError } from "~/components/general-error";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useActiveDownloads } from "~/hooks/use-active-downloads";
import {
	createDownloadHistoryQuery,
	createSearchMissingMutation,
	type Download,
	type DownloadStatus,
	downloadHistoryQueryOptions,
} from "~/lib/api";

export const Route = createFileRoute("/_layout/downloads")({
	loader: ({ context: { queryClient } }) => {
		queryClient.ensureQueryData(downloadHistoryQueryOptions());
	},
	component: DownloadsPage,
	errorComponent: GeneralError,
});

function formatSpeed(bytesPerSec: number): string {
	if (bytesPerSec === 0) return "0 B/s";
	const k = 1024;
	const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
	const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
	return `${parseFloat((bytesPerSec / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatEta(seconds: number): string {
	if (seconds === 8640000) return "∞";
	if (seconds <= 0) return "Done";

	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function DownloadsPage() {
	const queue = useActiveDownloads();
	const historyQuery = createDownloadHistoryQuery();
	const searchMissing = createSearchMissingMutation();

	const queueCount = () => queue().length;

	return (
		<div class="flex flex-col h-[calc(100vh-2rem)] gap-4">
			<div class="flex items-center justify-between px-1">
				<Button
					variant="outline"
					size="sm"
					onClick={() => searchMissing.mutate(undefined)}
					disabled={searchMissing.isPending}
				>
					<IconSearch class="mr-2 h-4 w-4" />
					Search Missing
				</Button>
			</div>

			<Card class="flex-1 overflow-hidden flex flex-col">
				<Tabs defaultValue="queue" class="h-full flex flex-col">
					<div class="px-4 pt-3 border-b">
						<TabsList class="w-full justify-start h-auto p-0 pb-px bg-transparent border-b-0 space-x-6">
							<TabsTrigger
								value="queue"
								class="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent"
							>
								Queue
								<Show when={queueCount() > 0}>
									<Badge
										variant="secondary"
										class="ml-2 h-5 px-1.5 min-w-[1.25rem] text-[10px]"
									>
										{queueCount()}
									</Badge>
								</Show>
							</TabsTrigger>
							<TabsTrigger
								value="history"
								class="h-9 px-0 pb-3 rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent"
							>
								History
							</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent value="queue" class="flex-1 overflow-auto mt-0 min-h-0">
						<div class="relative">
							<Table class="table-fixed">
								<TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
									<TableRow class="hover:bg-transparent border-none">
										<TableHead class="w-[50px]"></TableHead>
										<TableHead>Name</TableHead>
										<TableHead class="w-[200px]">Progress</TableHead>
										<TableHead class="w-[100px] hidden md:table-cell">
											Speed
										</TableHead>
										<TableHead class="w-[100px] hidden md:table-cell">
											ETA
										</TableHead>
										<TableHead class="w-[120px]">Status</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<Show
										when={queue().length > 0}
										fallback={
											<TableRow>
												<TableCell
													colSpan={6}
													class="h-32 text-center text-muted-foreground"
												>
													No active downloads
												</TableCell>
											</TableRow>
										}
									>
										<For each={queue()}>
											{(item) => <ActiveDownloadRow item={item} />}
										</For>
									</Show>
								</TableBody>
							</Table>
						</div>
					</TabsContent>

					<TabsContent
						value="history"
						class="flex-1 overflow-auto mt-0 min-h-0"
					>
						<div class="relative">
							<Table class="table-fixed">
								<TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
									<TableRow class="hover:bg-transparent border-none">
										<TableHead class="w-[50px]"></TableHead>
										<TableHead>Anime</TableHead>
										<TableHead class="w-[100px]">Episode</TableHead>
										<TableHead class="w-[180px] hidden md:table-cell">
											Added
										</TableHead>
										<TableHead class="w-[120px]">Status</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<Show
										when={!historyQuery.isLoading}
										fallback={
											<For each={[1, 2, 3, 4, 5]}>
												{() => (
													<TableRow>
														<TableCell>
															<Skeleton class="h-4 w-4 rounded-full" />
														</TableCell>
														<TableCell>
															<Skeleton class="h-4 w-48" />
														</TableCell>
														<TableCell>
															<Skeleton class="h-4 w-12" />
														</TableCell>
														<TableCell>
															<Skeleton class="h-4 w-24" />
														</TableCell>
														<TableCell>
															<Skeleton class="h-4 w-16" />
														</TableCell>
													</TableRow>
												)}
											</For>
										}
									>
										<Show
											when={historyQuery.data && historyQuery.data.length > 0}
											fallback={
												<TableRow>
													<TableCell
														colSpan={5}
														class="h-32 text-center text-muted-foreground"
													>
														No download history
													</TableCell>
												</TableRow>
											}
										>
											<For each={historyQuery.data}>
												{(item) => <DownloadRow item={item} isHistory />}
											</For>
										</Show>
									</Show>
								</TableBody>
							</Table>
						</div>
					</TabsContent>
				</Tabs>
			</Card>
		</div>
	);
}

function ActiveDownloadRow(props: { item: DownloadStatus }) {
	return (
		<TableRow class="group h-12">
			<TableCell class="py-2 pl-4">
				<Show
					when={!props.item.state.includes("Error")}
					fallback={<IconAlertTriangle class="w-4 h-4 text-red-500 shrink-0" />}
				>
					<Show
						when={!props.item.state.includes("Paused")}
						fallback={
							<IconPlayerPause class="w-4 h-4 text-yellow-500 shrink-0" />
						}
					>
						<IconDownload class="w-4 h-4 text-blue-500 shrink-0 animate-pulse" />
					</Show>
				</Show>
			</TableCell>
			<TableCell class="font-medium">
				<div class="flex flex-col justify-center">
					<span class="line-clamp-1 text-sm" title={props.item.name}>
						{props.item.name}
					</span>
				</div>
			</TableCell>
			<TableCell>
				<div class="flex items-center gap-2">
					<Progress
						value={props.item.progress * 100}
						class="h-1.5 w-full bg-muted"
					/>
					<span class="text-xs font-mono text-muted-foreground w-8 text-right">
						{Math.round(props.item.progress * 100)}%
					</span>
				</div>
			</TableCell>
			<TableCell class="text-sm text-muted-foreground whitespace-nowrap tabular-nums hidden md:table-cell">
				{formatSpeed(props.item.speed)}
			</TableCell>
			<TableCell class="text-sm text-muted-foreground whitespace-nowrap tabular-nums hidden md:table-cell">
				{formatEta(props.item.eta)}
			</TableCell>
			<TableCell>
				<div class="flex items-center gap-2">
					<span class="capitalize text-sm text-muted-foreground">
						{props.item.state}
					</span>
				</div>
			</TableCell>
		</TableRow>
	);
}

function DownloadRow(props: { item: Download; isHistory?: boolean }) {
	const getStatusIcon = (status?: string) => {
		if (!status) return <IconClock class="h-4 w-4 text-muted-foreground" />;

		switch (status.toLowerCase()) {
			case "completed":
				return <IconCheck class="h-4 w-4 text-green-500" />;
			case "downloading":
				return <IconArrowDown class="h-4 w-4 text-blue-500 animate-pulse" />;
			case "failed":
				return <IconX class="h-4 w-4 text-destructive" />;
			case "paused":
				return <IconPlayerPause class="h-4 w-4 text-yellow-500" />;
			default:
				return <IconClock class="h-4 w-4 text-muted-foreground" />;
		}
	};

	const dateStr = props.item.download_date || props.item.added_at;

	return (
		<TableRow class="group h-12">
			<TableCell class="py-2 pl-4">
				{getStatusIcon(props.item.status)}
			</TableCell>
			<TableCell class="font-medium">
				<div class="flex flex-col justify-center">
					<span class="line-clamp-1">{props.item.anime_title}</span>
					<span class="text-xs text-muted-foreground line-clamp-1">
						{props.item.torrent_name}
					</span>
				</div>
			</TableCell>
			<TableCell>
				<Badge variant="outline" class="font-normal font-mono text-xs">
					{props.item.episode_number.toString().padStart(2, "0")}
				</Badge>
			</TableCell>
			<Show
				when={!props.isHistory}
				fallback={
					<TableCell class="text-muted-foreground text-sm whitespace-nowrap hidden md:table-cell">
						{dateStr ? new Date(dateStr).toLocaleString() : "-"}
					</TableCell>
				}
			>
				<TableCell>
					<Show
						when={
							props.item.status?.toLowerCase() === "downloading" &&
							props.item.progress !== undefined
						}
						fallback={<span class="text-muted-foreground text-sm">-</span>}
					>
						<div class="flex items-center gap-2">
							<Progress
								value={props.item.progress ?? 0}
								class="h-1.5 w-full bg-muted"
							/>
							<span class="text-xs font-mono text-muted-foreground w-8 text-right">
								{Math.round(props.item.progress ?? 0)}%
							</span>
						</div>
					</Show>
				</TableCell>
			</Show>
			<TableCell>
				<div class="flex items-center gap-2">
					<span class="capitalize text-sm text-muted-foreground">
						{props.item.status || "Unknown"}
					</span>
				</div>
			</TableCell>
		</TableRow>
	);
}
