import { IconArrowRight, IconCheck, IconClock } from "@tabler/icons-solidjs";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { formatDistanceToNow } from "date-fns";
import { createMemo, For, Show } from "solid-js";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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

  const recentActivity = createMemo(() => activityQuery.data?.slice(0, 5) ?? []);

  const statsSummary = createMemo(() => {
    const s = statsQuery.data;
    if (!s) return null;
    return `${s.total_anime} anime · ${s.downloaded_episodes}/${s.total_episodes} episodes · ${s.downloaded_percent}% complete`;
  });

  return (
    <div class="space-y-6">
      <PageHeader title="Dashboard">
        <Show when={statsSummary()}>
          {(summary) => <p class="text-xs font-mono text-muted-foreground">{summary()}</p>}
        </Show>
      </PageHeader>

      {/* Stat Bar */}
      <Show
        when={!statsQuery.isError}
        fallback={
          <div class="p-4 text-center text-destructive border border-destructive/20">
            Failed to load stats. Please refresh.
          </div>
        }
      >
        <Show when={statsQuery.data} fallback={<DashboardLoading />}>
          {(stats) => (
            <div class="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border pb-4">
              <StatItem label="Anime" value={stats().total_anime} />
              <StatItem
                label="Monitored"
                value={stats().monitored_anime}
                sub={`${stats().up_to_date_anime} up to date`}
              />
              <StatItem label="Episodes" value={stats().total_episodes} />
              <StatItem
                label="Downloaded"
                value={stats().downloaded_episodes}
                sub={`${stats().downloaded_percent}%`}
              />
              <StatItem
                label="Missing"
                value={stats().missing_episodes}
                {...(stats().missing_episodes > 0 ? { tone: "warning" as const } : {})}
              />
              <div class="h-6 w-px bg-border hidden sm:block" />
              <div class="flex items-center gap-3">
                <Link to="/rss">
                  <Button variant="ghost" size="sm" class="text-xs">
                    {stats().rss_feeds} RSS feeds
                    <IconArrowRight class="ml-1 h-3.5 w-3.5" />
                  </Button>
                </Link>
                <Link
                  to="/downloads"
                  search={{
                    events_anime_id: "",
                    events_cursor: "",
                    events_direction: "next",
                    events_download_id: "",
                    events_end_date: "",
                    events_event_type: "all",
                    events_start_date: "",
                    events_status: "",
                    tab: "queue",
                  }}
                >
                  <Button variant="ghost" size="sm" class="text-xs">
                    {stats().recent_downloads} recent downloads
                    <IconArrowRight class="ml-1 h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Show>
      </Show>

      {/* Activity Feed */}
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Recent Activity
          </h2>
          <Show when={activityQuery.data && activityQuery.data?.length > 5}>
            <Link
              to="/downloads"
              search={{
                events_anime_id: "",
                events_cursor: "",
                events_direction: "next",
                events_download_id: "",
                events_end_date: "",
                events_event_type: "all",
                events_start_date: "",
                events_status: "",
                tab: "queue",
              }}
            >
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </Show>
        </div>
        <Show
          when={!activityQuery.isLoading}
          fallback={
            <div
              class="p-4 text-center text-muted-foreground"
              role="status"
              aria-label="Loading activity"
            >
              Loading activity...
            </div>
          }
        >
          <Show
            when={activityQuery.data && activityQuery.data?.length > 0}
            fallback={<p class="text-center text-muted-foreground py-6">No recent activity</p>}
          >
            <ul role="list" class="divide-y divide-border">
              <For each={recentActivity()}>
                {(item) => (
                  <li>
                    <ActivityRow item={item} />
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </div>
    </div>
  );
}

function StatItem(props: {
  label: string;
  value: number;
  sub?: string | undefined;
  tone?: "warning" | undefined;
}) {
  return (
    <div class="flex items-baseline gap-2">
      <span
        class={`text-xl font-semibold tabular-nums ${
          props.tone === "warning" ? "text-warning" : "text-foreground"
        }`}
      >
        {props.value}
      </span>
      <span class="text-xs text-muted-foreground">{props.label}</span>
      <Show when={props.sub}>
        <Badge variant="secondary" class="text-[10px] px-1.5 py-0 h-4">
          {props.sub}
        </Badge>
      </Show>
    </div>
  );
}

function ActivityRow(props: { item: ActivityItem }) {
  return (
    <div class="flex items-center gap-4 py-3 hover:bg-muted/30 transition-colors">
      <div class="p-2 bg-success/10">
        <IconCheck class="h-4 w-4 text-success" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">{props.item.anime_title}</p>
        <p class="text-xs text-muted-foreground">{props.item.description}</p>
      </div>
      <time
        class="flex items-center gap-1 text-xs text-muted-foreground shrink-0"
        dateTime={props.item.timestamp}
      >
        <IconClock class="h-3.5 w-3.5" />
        {formatDistanceToNow(new Date(props.item.timestamp), {
          addSuffix: true,
        })}
      </time>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div class="flex gap-6 pb-4 border-b border-border" role="status" aria-label="Loading stats">
      <For each={[1, 2, 3, 4, 5]}>
        {() => (
          <div class="flex items-baseline gap-2">
            <div class="h-6 w-8 bg-muted animate-pulse" />
            <div class="h-3 w-14 bg-muted animate-pulse" />
          </div>
        )}
      </For>
    </div>
  );
}
