import {
	IconArrowRight,
	IconCheck,
	IconClock,
	IconCloudDownload,
	IconDeviceTv,
} from "@tabler/icons-solidjs";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, For, Show } from "solid-js";
import { GeneralError } from "~/components/general-error";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ActivityItem,
	activityQueryOptions,
	createActivityQuery,
	createLibraryStatsQuery,
	libraryStatsQueryOptions,
} from "~/lib/api";

export const Route = createFileRoute("/_layout/")({
	loader: async ({ context: { queryClient } }) => {
		await Promise.all([
			queryClient.ensureQueryData(libraryStatsQueryOptions()),
			queryClient.ensureQueryData(activityQueryOptions()),
		]);
	},
	component: DashboardPage,
	errorComponent: GeneralError,
});

function DashboardPage() {
	const statsQuery = createLibraryStatsQuery();
	const activityQuery = createActivityQuery();

	const recentActivity = createMemo(
		() => activityQuery.data?.slice(0, 5) ?? [],
	);

	return (
		<div class="space-y-6">
			{/* Stats Grid */}
			<Show when={statsQuery.data} fallback={<DashboardLoading />}>
				{(stats) => (
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<Card class="transition-all duration-150 hover:shadow-md">
							<CardHeader class="flex flex-row items-center justify-between pb-2">
								<CardTitle class="text-sm font-medium text-muted-foreground">
									Monitored Anime
								</CardTitle>
								<IconDeviceTv class="h-4 w-4 text-primary" />
							</CardHeader>
							<CardContent>
								<div class="text-2xl font-bold">{stats().total_anime}</div>
							</CardContent>
						</Card>

						<Card class="transition-all duration-150 hover:shadow-md">
							<CardHeader class="flex flex-row items-center justify-between pb-2">
								<CardTitle class="text-sm font-medium text-muted-foreground">
									Total Episodes
								</CardTitle>
								<IconDeviceTv class="h-4 w-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div class="text-2xl font-bold">{stats().total_episodes}</div>
							</CardContent>
						</Card>

						<Card class="transition-all duration-150 hover:shadow-md">
							<CardHeader class="flex flex-row items-center justify-between pb-2">
								<CardTitle class="text-sm font-medium text-muted-foreground">
									Downloaded
								</CardTitle>
								<IconCheck class="h-4 w-4 text-green-500" />
							</CardHeader>
							<CardContent>
								<div class="text-2xl font-bold">
									{stats().downloaded_episodes}
								</div>
							</CardContent>
						</Card>

						<Card class="transition-all duration-150 hover:shadow-md">
							<CardHeader class="flex flex-row items-center justify-between pb-2">
								<CardTitle class="text-sm font-medium text-muted-foreground">
									Missing
								</CardTitle>
								<IconCloudDownload class="h-4 w-4 text-orange-500" />
							</CardHeader>
							<CardContent>
								<div class="text-2xl font-bold">{stats().missing_episodes}</div>
							</CardContent>
						</Card>
					</div>
				)}
			</Show>

			{/* Quick Stats Row */}
			<div class="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader class="pb-2">
						<CardTitle class="text-sm font-medium">RSS Feeds</CardTitle>
					</CardHeader>
					<CardContent class="flex items-center justify-between">
						<span class="text-2xl font-bold">
							{statsQuery.data?.rss_feeds ?? 0}
						</span>
						<Link to="/rss">
							<Button variant="ghost" size="sm">
								Manage
								<IconArrowRight class="ml-1 h-4 w-4" />
							</Button>
						</Link>
					</CardContent>
				</Card>
				<Card>
					<CardHeader class="pb-2">
						<CardTitle class="text-sm font-medium">Recent Downloads</CardTitle>
					</CardHeader>
					<CardContent class="flex items-center justify-between">
						<span class="text-2xl font-bold">
							{statsQuery.data?.recent_downloads ?? 0}
						</span>
						<Link to="/downloads">
							<Button variant="ghost" size="sm">
								View All
								<IconArrowRight class="ml-1 h-4 w-4" />
							</Button>
						</Link>
					</CardContent>
				</Card>
			</div>

			{/* Activity Feed */}
			<Card>
				<CardHeader class="pb-3">
					<div class="flex items-center justify-between">
						<CardTitle class="text-base">Recent Activity</CardTitle>
						<Show when={activityQuery.data && activityQuery.data?.length > 5}>
							<Link to="/downloads">
								<Button variant="ghost" size="sm">
									View All
								</Button>
							</Link>
						</Show>
					</div>
				</CardHeader>
				<CardContent>
					<Show
						when={!activityQuery.isLoading}
						fallback={
							<div class="p-4 text-center text-muted-foreground">
								Loading activity...
							</div>
						}
					>
						<Show
							when={activityQuery.data && activityQuery.data?.length > 0}
							fallback={
								<p class="text-center text-muted-foreground py-6">
									No recent activity
								</p>
							}
						>
							<div class="space-y-2">
								<For each={recentActivity()}>
									{(item) => <ActivityRow item={item} />}
								</For>
							</div>
						</Show>
					</Show>
				</CardContent>
			</Card>
		</div>
	);
}

function ActivityRow(props: { item: ActivityItem }) {
	return (
		<div class="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
			<div class="p-2 rounded-lg bg-green-500/10">
				<IconCheck class="h-4 w-4 text-green-500" />
			</div>
			<div class="flex-1 min-w-0">
				<p class="text-sm font-medium truncate">{props.item.anime_title}</p>
				<p class="text-xs text-muted-foreground">{props.item.description}</p>
			</div>
			<div class="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
				<IconClock class="h-3.5 w-3.5" />
				{formatTimeAgo(props.item.timestamp)}
			</div>
		</div>
	);
}

function formatTimeAgo(timestamp: string): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString();
}

function DashboardLoading() {
	return (
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<For each={[1, 2, 3, 4]}>
				{() => (
					<Card>
						<CardHeader class="pb-2">
							<div class="h-4 w-24 bg-muted animate-pulse rounded" />
						</CardHeader>
						<CardContent>
							<div class="h-8 w-16 bg-muted animate-pulse rounded" />
						</CardContent>
					</Card>
				)}
			</For>
		</div>
	);
}
