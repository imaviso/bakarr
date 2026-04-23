import { ArrowRightIcon, CheckIcon, ClockIcon } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { type ActivityItem, activityQueryOptions, libraryStatsQueryOptions } from "~/lib/api";
import { createDownloadsRouteSearch } from "~/lib/download-events-search";
import { usePageTitle } from "~/lib/page-title";

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
  usePageTitle("Dashboard");
  const stats = useSuspenseQuery(libraryStatsQueryOptions()).data;
  const activity = useSuspenseQuery(activityQueryOptions()).data;

  const recentActivity = activity.slice(0, 5);

  const statsSummary = `${stats.total_anime} anime · ${stats.downloaded_episodes}/${stats.total_episodes} episodes · ${stats.downloaded_percent}% complete`;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard">
        <p className="text-xs text-muted-foreground">{statsSummary}</p>
      </PageHeader>

      {/* Stat Bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border pb-4">
        <StatItem label="Anime" value={stats.total_anime} />
        <StatItem
          label="Monitored"
          value={stats.monitored_anime}
          sub={`${stats.up_to_date_anime} up to date`}
        />
        <StatItem label="Episodes" value={stats.total_episodes} />
        <StatItem
          label="Downloaded"
          value={stats.downloaded_episodes}
          sub={`${stats.downloaded_percent}%`}
        />
        <StatItem
          label="Missing"
          value={stats.missing_episodes}
          {...(stats.missing_episodes > 0 ? { tone: "warning" as const } : {})}
        />
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-3">
          <Link to="/rss">
            <Button variant="ghost" size="sm" className="text-xs">
              {stats.rss_feeds} RSS feeds
              <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
          <Link to="/downloads" search={createDownloadsRouteSearch({ tab: "queue" })}>
            <Button variant="ghost" size="sm" className="text-xs">
              {stats.recent_downloads} recent downloads
              <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Activity Feed */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Recent Activity
          </h2>
          {activity.length > 5 && (
            <Link to="/downloads" search={createDownloadsRouteSearch({ tab: "queue" })}>
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          )}
        </div>
        {recentActivity.length > 0 ? (
          <ul role="list" className="divide-y divide-border">
            {recentActivity.map((item) => (
              <li key={item.timestamp + item.anime_title + item.description}>
                <ActivityRow item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-muted-foreground py-6">No recent activity</p>
        )}
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
    <div className="flex items-baseline gap-2">
      <span
        className={`text-xl font-semibold tabular-nums ${props.tone === "warning" ? "text-warning" : "text-foreground"}`}
      >
        {props.value}
      </span>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      {props.sub && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
          {props.sub}
        </Badge>
      )}
    </div>
  );
}

function ActivityRow(props: { item: ActivityItem }) {
  return (
    <div className="flex items-center gap-4 py-3 hover:bg-muted transition-colors">
      <div className="p-2 bg-success/10">
        <CheckIcon className="h-4 w-4 text-success" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{props.item.anime_title}</p>
        <p className="text-xs text-muted-foreground">{props.item.description}</p>
      </div>
      <time
        className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"
        dateTime={props.item.timestamp}
      >
        <ClockIcon className="h-3.5 w-3.5" />
        {formatDistanceToNow(new Date(props.item.timestamp), {
          addSuffix: true,
        })}
      </time>
    </div>
  );
}
