import {
	IconAlertCircle,
	IconAlertTriangle,
	IconCalendar,
	IconCheck,
	IconDownload,
	IconEye,
	IconFileSpreadsheet,
	IconFilter,
	IconInfoCircle,
	IconJson,
	IconRefresh,
	IconTag,
	IconTrash,
} from "@tabler/icons-solidjs";
import { createFileRoute } from "@tanstack/solid-router";
import { format } from "date-fns";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import {
	Filter,
	type FilterColumnConfig,
	type FilterState,
} from "~/components/filters";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	createClearLogsMutation,
	createSystemLogsQuery,
	getExportLogsUrl,
	type SystemLog,
	systemLogsQueryOptions,
} from "~/lib/api";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_layout/logs")({
	loader: ({ context: { queryClient } }) => {
		queryClient.ensureQueryData(
			systemLogsQueryOptions(1, undefined, undefined, undefined, undefined),
		);
	},
	component: LogsPage,
	errorComponent: GeneralError,
});

function LogsPage() {
	const [page, setPage] = createSignal(1);
	const [autoRefresh, setAutoRefresh] = createSignal(false);
	const [selectedLog, setSelectedLog] = createSignal<SystemLog | null>(null);
	const [filterStates, setFilterStates] = createSignal<FilterState[]>([]);

	// Define filter columns
	const filterColumns: FilterColumnConfig[] = [
		{
			id: "level",
			label: "Level",
			type: "select",
			icon: <IconFilter class="h-4 w-4" />,
			operators: ["is"],
			options: [
				{
					value: "info",
					label: "Info",
					icon: <IconInfoCircle class="h-4 w-4 text-blue-500" />,
				},
				{
					value: "warn",
					label: "Warn",
					icon: <IconAlertTriangle class="h-4 w-4 text-yellow-500" />,
				},
				{
					value: "error",
					label: "Error",
					icon: <IconAlertCircle class="h-4 w-4 text-red-500" />,
				},
				{
					value: "success",
					label: "Success",
					icon: <IconCheck class="h-4 w-4 text-green-500" />,
				},
			],
		},
		{
			id: "eventType",
			label: "Event Type",
			type: "select",
			icon: <IconTag class="h-4 w-4" />,
			operators: ["is"],
			options: [
				{ value: "Scan", label: "Scan" },
				{ value: "Download", label: "Download" },
				{ value: "Import", label: "Import" },
				{ value: "RSS", label: "RSS" },
				{ value: "Error", label: "Error" },
			],
		},
		{
			id: "startDate",
			label: "Start Date",
			type: "date",
			icon: <IconCalendar class="h-4 w-4" />,
			operators: ["is_after"],
		},
		{
			id: "endDate",
			label: "End Date",
			type: "date",
			icon: <IconCalendar class="h-4 w-4" />,
			operators: ["is_before"],
		},
	];

	// Convert filter states to API params
	const apiParams = createMemo(() => {
		const params: Record<string, string | undefined> = {};

		for (const filter of filterStates()) {
			const value = Array.isArray(filter.value)
				? filter.value[0]
				: filter.value;
			if (value) {
				if (filter.columnId === "endDate") {
					// Append end of day time to ensure inclusive filtering
					params[filter.columnId] = `${value} 23:59:59`;
				} else if (filter.columnId === "startDate") {
					// Append start of day time for consistency
					params[filter.columnId] = `${value} 00:00:00`;
				} else {
					params[filter.columnId] = value;
				}
			}
		}

		return params;
	});

	// Reactively fetch logs based on page and filters
	const logsQuery = createSystemLogsQuery(
		() => page(),
		() => apiParams().level,
		() => apiParams().eventType,
		() => apiParams().startDate,
		() => apiParams().endDate,
	);
	const clearLogs = createClearLogsMutation();

	// Auto-refresh logic
	createEffect(() => {
		let interval: ReturnType<typeof setInterval>;
		if (autoRefresh()) {
			interval = setInterval(() => {
				logsQuery.refetch();
			}, 3000);
		}
		return () => clearInterval(interval);
	});

	// Reset page when filters change
	createEffect(() => {
		filterStates();
		setPage(1);
	});

	const handlePageChange = (newPage: number) => {
		if (newPage < 1) return;
		if (logsQuery.data && newPage > logsQuery.data.total_pages) return;
		setPage(newPage);
	};

	const handleExport = (format: "json" | "csv") => {
		const url = getExportLogsUrl(
			apiParams().level,
			apiParams().eventType,
			apiParams().startDate,
			apiParams().endDate,
			format,
		);
		window.open(url, "_blank");
	};

	// Custom color classes
	const getLevelColorClass = (level: string) => {
		switch (level.toLowerCase()) {
			case "error":
				return "bg-red-500/15 text-red-500 hover:bg-red-500/25 border-red-500/20";
			case "warn":
				return "bg-yellow-500/15 text-yellow-500 hover:bg-yellow-500/25 border-yellow-500/20";
			case "success":
				return "bg-green-500/15 text-green-500 hover:bg-green-500/25 border-green-500/20";
			case "info":
				return "bg-blue-500/15 text-blue-500 hover:bg-blue-500/25 border-blue-500/20";
			default:
				return "";
		}
	};

	const getLevelIcon = (level: string) => {
		switch (level.toLowerCase()) {
			case "error":
				return <IconAlertCircle class="h-3.5 w-3.5 mr-1" />;
			case "warn":
				return <IconAlertTriangle class="h-3.5 w-3.5 mr-1" />;
			case "success":
				return <IconCheck class="h-3.5 w-3.5 mr-1" />;
			case "info":
				return <IconInfoCircle class="h-3.5 w-3.5 mr-1" />;
			default:
				return <IconInfoCircle class="h-3.5 w-3.5 mr-1" />;
		}
	};

	return (
		<div class="space-y-6">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-1">
				<div>
					<h1 class="text-xl font-semibold tracking-tight">System Logs</h1>
					<p class="text-sm text-muted-foreground">
						View, filter, and export system events and errors
					</p>
				</div>
				<div class="flex items-center gap-2">
					<div class="flex items-center gap-2 mr-2">
						<Switch
							checked={autoRefresh()}
							onChange={setAutoRefresh}
							id="auto-refresh"
						/>
						<label
							for="auto-refresh"
							class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
						>
							Auto-Refresh
						</label>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => logsQuery.refetch()}
						disabled={logsQuery.isRefetching}
					>
						<IconRefresh
							class={cn(
								"h-4 w-4 mr-2",
								logsQuery.isRefetching && "animate-spin",
							)}
						/>
						Refresh
					</Button>

					<DropdownMenu>
						<DropdownMenuTrigger as={Button} variant="outline" size="sm">
							<IconDownload class="h-4 w-4 mr-2" />
							Export
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuItem onClick={() => handleExport("json")}>
								<IconJson class="h-4 w-4 mr-2" />
								Export as JSON
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => handleExport("csv")}>
								<IconFileSpreadsheet class="h-4 w-4 mr-2" />
								Export as CSV
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<AlertDialog>
						<AlertDialogTrigger as={Button} variant="destructive" size="sm">
							<IconTrash class="h-4 w-4 mr-2" />
							Clear Logs
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Clear All Logs?</AlertDialogTitle>
								<AlertDialogDescription>
									This action cannot be undone. This will permanently delete all
									system logs from the database.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
									onClick={() => clearLogs.mutate()}
								>
									Clear Logs
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>

			<Filter.Provider
				columns={filterColumns}
				value={filterStates()}
				onChange={setFilterStates}
			>
				<Filter.Root>
					<div class="flex flex-wrap items-center gap-2">
						<Filter.Menu />
						<Filter.List />
						<Filter.Actions />
					</div>
				</Filter.Root>
			</Filter.Provider>

			<Card class="border-primary/20">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead class="w-[160px]">Timestamp</TableHead>
							<TableHead class="w-[100px]">Level</TableHead>
							<TableHead class="w-[120px]">Source</TableHead>
							<TableHead>Message</TableHead>
							<TableHead class="w-[80px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						<Show
							when={!logsQuery.isLoading}
							fallback={
								<For each={[1, 2, 3, 4, 5]}>
									{() => (
										<TableRow>
											<TableCell>
												<Skeleton class="h-4 w-32" />
											</TableCell>
											<TableCell>
												<Skeleton class="h-4 w-16" />
											</TableCell>
											<TableCell>
												<Skeleton class="h-4 w-24" />
											</TableCell>
											<TableCell>
												<Skeleton class="h-4 w-full" />
											</TableCell>
											<TableCell>
												<Skeleton class="h-8 w-8" />
											</TableCell>
										</TableRow>
									)}
								</For>
							}
						>
							<Show when={logsQuery.isError}>
								<TableRow>
									<TableCell
										colSpan={5}
										class="h-24 text-center text-destructive"
									>
										Error loading logs. Please try again.
									</TableCell>
								</TableRow>
							</Show>

							<Show when={logsQuery.data?.logs.length === 0}>
								<TableRow>
									<TableCell
										colSpan={5}
										class="h-24 text-center text-muted-foreground"
									>
										No logs found.
									</TableCell>
								</TableRow>
							</Show>

							<For each={logsQuery.data?.logs}>
								{(log) => (
									<TableRow class="group">
										<TableCell class="font-mono text-xs text-muted-foreground whitespace-nowrap">
											{format(
												new Date(`${log.created_at}Z`),
												"yyyy-MM-dd HH:mm:ss",
											)}
										</TableCell>
										<TableCell>
											<Badge
												variant="outline"
												class={cn(
													"text-xs capitalize pl-1 pr-2 py-0.5",
													getLevelColorClass(log.level),
												)}
											>
												{getLevelIcon(log.level)}
												{log.level}
											</Badge>
										</TableCell>
										<TableCell class="text-xs font-medium text-muted-foreground capitalize">
											{log.event_type}
										</TableCell>
										<TableCell class="text-sm max-w-[500px]">
											<div class="truncate" title={log.message}>
												{log.message}
											</div>
											<Show when={log.details}>
												<div
													class="text-xs text-muted-foreground mt-0.5 font-mono truncate opacity-70"
													title={log.details}
												>
													{log.details}
												</div>
											</Show>
										</TableCell>
										<TableCell>
											<Show when={log.details}>
												<Button
													variant="ghost"
													size="icon"
													class="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
													onClick={() => setSelectedLog(log)}
													title="View Details"
												>
													<IconEye class="h-4 w-4" />
												</Button>
											</Show>
										</TableCell>
									</TableRow>
								)}
							</For>
						</Show>
					</TableBody>
				</Table>
			</Card>

			<Show when={logsQuery.data && logsQuery.data.total_pages > 1}>
				<div class="flex items-center justify-between">
					<div class="text-sm text-muted-foreground">
						Page {page()} of {logsQuery.data?.total_pages}
					</div>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={page() <= 1}
							onClick={() => handlePageChange(page() - 1)}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={page() >= (logsQuery.data?.total_pages || 1)}
							onClick={() => handlePageChange(page() + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			</Show>

			<Dialog
				open={!!selectedLog()}
				onOpenChange={(open) => !open && setSelectedLog(null)}
			>
				<DialogContent class="max-w-3xl max-h-[80vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>Log Details</DialogTitle>
						<DialogDescription>
							{selectedLog() &&
								format(
									new Date(`${selectedLog()?.created_at || ""}Z`),
									"yyyy-MM-dd HH:mm:ss",
								)}
						</DialogDescription>
					</DialogHeader>
					<div class="flex-1 overflow-auto space-y-4 py-4">
						<div class="space-y-1">
							<div class="text-sm font-medium text-muted-foreground">
								Message
							</div>
							<div class="p-3 rounded-md bg-muted text-sm font-mono whitespace-pre-wrap break-words">
								{selectedLog()?.message}
							</div>
						</div>
						<Show when={selectedLog()?.details}>
							<div class="space-y-1">
								<div class="text-sm font-medium text-muted-foreground">
									Details
								</div>
								<div class="p-3 rounded-md bg-muted text-xs font-mono whitespace-pre-wrap break-words">
									{selectedLog()?.details}
								</div>
							</div>
						</Show>
						<div class="grid grid-cols-2 gap-4 text-sm">
							<div>
								<span class="text-muted-foreground">Level: </span>
								<span class="capitalize font-medium">
									{selectedLog()?.level}
								</span>
							</div>
							<div>
								<span class="text-muted-foreground">Source: </span>
								<span class="capitalize font-medium">
									{selectedLog()?.event_type}
								</span>
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
