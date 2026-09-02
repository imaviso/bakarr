import { RiArrowRightLine } from "@remixicon/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralError } from "@/components/shared/general-error";
import { PageHeader } from "@/app/layout/page-header";
import { PageShell } from "@/app/layout/page-shell";
import { SectionLabel } from "@/components/shared/section-label";
import { Button } from "@/components/ui/button";
import { activityQueryOptions, libraryStatsQueryOptions } from "@/api/library";
import { createDownloadsRouteSearch } from "@/domain/download/events-search";
import { usePageTitle } from "@/app/page-title";
import { Separator } from "@/components/ui/separator";
import { StatItem } from "@/app/dashboard/stat-item";
import { ActivityRow } from "@/app/dashboard/activity-row";

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

  const statsSummary = `${stats.total_media} media · ${stats.downloaded_units}/${stats.total_units} units · ${stats.downloaded_percent}% complete`;

  return (
    <PageShell>
      <PageHeader title="Dashboard" subtitle={statsSummary} />

      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-3 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 ease-out"
        style={{ animationDuration: "300ms" }}
      >
        <StatItem label="Media" value={stats.total_media} />
        <StatItem
          label="Monitored"
          value={stats.monitored_media}
          sub={`${stats.up_to_date_media} up to date`}
        />
        <StatItem label="Units" value={stats.total_units} />
        <StatItem
          label="Downloaded"
          value={stats.downloaded_units}
          sub={`${stats.downloaded_percent}%`}
        />
        <StatItem
          label="Missing"
          value={stats.missing_units}
          tone={stats.missing_units > 0 ? "warning" : undefined}
        />
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onPress={() => navigate({ to: "/rss" })}
          >
            {stats.rss_feeds} RSS feeds
            <RiArrowRightLine className="ml-1 h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onPress={() =>
              navigate({ to: "/downloads", search: createDownloadsRouteSearch({ tab: "queue" }) })
            }
          >
            {stats.recent_downloads} recent downloads
            <RiArrowRightLine className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 ease-out"
        style={{ animationDuration: "500ms" }}
      >
        <div className="flex items-center justify-between">
          <SectionLabel as="h2">Recent Activity</SectionLabel>
          {activity.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() =>
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
