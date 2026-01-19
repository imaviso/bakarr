import {
	IconActivity,
	IconDatabase,
	IconDownload,
	IconRefresh,
} from "@tabler/icons-solidjs";
import { Show } from "solid-js";
import { toast } from "solid-sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	createSystemStatusQuery,
	createTriggerRssCheckMutation,
	createTriggerScanMutation,
} from "~/lib/api";

export function SystemStatus() {
	const status = createSystemStatusQuery();
	const scanMutation = createTriggerScanMutation();
	const rssMutation = createTriggerRssCheckMutation();

	const handleScan = () => {
		scanMutation.mutate(undefined, {
			onSuccess: () => toast.success("Library scan triggered"),
		});
	};

	const handleRss = () => {
		rssMutation.mutate(undefined, {
			onSuccess: () => toast.success("RSS check triggered"),
		});
	};

	const formatBytes = (bytes: number) => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB", "TB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / k ** i).toFixed(2)) + " " + sizes[i];
	};

	const formatUptime = (seconds: number) => {
		const d = Math.floor(seconds / (3600 * 24));
		const h = Math.floor((seconds % (3600 * 24)) / 3600);
		const m = Math.floor((seconds % 3600) / 60);

		const parts = [];
		if (d > 0) parts.push(`${d}d`);
		if (h > 0) parts.push(`${h}h`);
		if (m > 0 || parts.length === 0) parts.push(`${m}m`);
		return parts.join(" ");
	};

	return (
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">System Status</CardTitle>
					<IconActivity class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">
						<Show when={status.data} fallback="-">
							{(data) => data().version}
						</Show>
					</div>
					<p class="text-xs text-muted-foreground">
						Uptime:{" "}
						<Show when={status.data} fallback="-">
							{(data) => formatUptime(data().uptime)}
						</Show>
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Disk Space</CardTitle>
					<IconDatabase class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">
						<Show when={status.data} fallback="-">
							{(data) => formatBytes(data().disk_space.free)}
						</Show>
					</div>
					<p class="text-xs text-muted-foreground">
						Free of{" "}
						<Show when={status.data} fallback="-">
							{(data) => formatBytes(data().disk_space.total)}
						</Show>
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Pending Downloads</CardTitle>
					<IconDownload class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">
						<Show when={status.data} fallback="0">
							{(data) => data().pending_downloads}
						</Show>
					</div>
					<p class="text-xs text-muted-foreground">
						Active Torrents:{" "}
						<Show when={status.data} fallback="0">
							{(data) => data().active_torrents}
						</Show>
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Quick Actions</CardTitle>
					<IconRefresh class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent class="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={handleScan}
						disabled={scanMutation.isPending}
					>
						Scan Lib
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={handleRss}
						disabled={rssMutation.isPending}
					>
						Check RSS
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
