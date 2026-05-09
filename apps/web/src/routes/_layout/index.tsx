import { ArrowRightIcon, CheckIcon, ClockIcon } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { EmptyState } from "~/components/shared/empty-state";
import { GeneralError } from "~/components/shared/general-error";
import { PageHeader } from "~/app/layout/page-header";
import { PageShell } from "~/app/layout/page-shell";
import { SectionLabel } from "~/components/shared/section-label";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import type { ActivityItem } from "~/api/contracts";
import { activityQueryOptions, libraryStatsQueryOptions } from "~/api/library";
import { createDownloadsRouteSearch } from "~/domain/download/events-search";
import { usePageTitle } from "~/domain/page-title";

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
  const navigate = useNavigate();
  const stats = useSuspenseQuery(libraryStatsQueryOptions()).data;
  const activity = useSuspenseQuery(activityQueryOptions()).data;

  const recentActivity = activity.slice(0, 5);

  const statsSummary = `${stats.total_anime} anime · ${stats.downloaded_episodes}/${stats.total_episodes} episodes · ${stats.downloaded_percent}% complete`;

  return (
    <PageShell>
      <PageHeader title="Dashboard" subtitle={statsSummary} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
          tone={stats.missing_episodes > 0 ? "warning" : undefined}
        />
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => navigate({ to: "/rss" })}
          >
            {stats.rss_feeds} RSS feeds
            <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() =>
              navigate({ to: "/downloads", search: createDownloadsRouteSearch({ tab: "queue" }) })
            }
          >
            {stats.recent_downloads} recent downloads
            <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionLabel as="h2">Recent Activity</SectionLabel>
          {activity.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                navigate({ to: "/downloads", search: createDownloadsRouteSearch({ tab: "queue" }) })
              }
            >
              View All
            </Button>
          )}
        </div>
        {recentActivity.length > 0 ? (
          <ul role="list" className="flex flex-col">
            {recentActivity.map((item) => (
              <li key={item.id} className="border-t border-dashed border-border first:border-t-0">
                <ActivityRow item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="No recent activity" />
        )}
      </div>
    </PageShell>
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
        className={`text-xl font-medium tabular-nums ${props.tone === "warning" ? "text-warning" : "text-foreground"}`}
      >
        {props.value}
      </span>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      {props.sub && (
        <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px]">
          {props.sub}
        </Badge>
      )}
    </div>
  );
}

function ActivityRow(props: { item: ActivityItem }) {
  return (
    <div className="flex items-center gap-4 py-3 transition-colors hover:bg-muted">
      <div className="bg-success/10 p-2">
        <CheckIcon className="h-4 w-4 text-success" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium">{props.item.anime_title}</p>
        <p className="text-xs text-muted-foreground">{props.item.description}</p>
      </div>
      <time
        className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
        dateTime={props.item.timestamp}
      >
        <ClockIcon className="h-3.5 w-3.5" />
        {formatDistanceToNow(props.item.timestamp, {
          addSuffix: true,
        })}
      </time>
    </div>
  );
}
