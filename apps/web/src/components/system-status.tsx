import {
  ActivityIcon,
  CloudIcon,
  DatabaseIcon,
  DownloadIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  createSystemTaskQuery,
  createSystemStatusQuery,
  createTriggerRssCheckMutation,
  createTriggerScanMutation,
  isTaskActive,
} from "~/lib/api";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

function formatRelativeTime(dateStr: string | null | undefined) {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatProviderStatus(
  name: string,
  input: { readonly configured: boolean; readonly enabled: boolean },
) {
  if (!input.enabled) {
    return `${name} disabled`;
  }

  return input.configured ? `${name} ready` : `${name} misconfigured`;
}

export function SystemStatus() {
  const status = createSystemStatusQuery();
  const [latestScanTaskId, setLatestScanTaskId] = useState<number | undefined>(undefined);
  const [latestRssTaskId, setLatestRssTaskId] = useState<number | undefined>(undefined);
  const latestScanTask = createSystemTaskQuery(latestScanTaskId);
  const latestRssTask = createSystemTaskQuery(latestRssTaskId);
  const isScanTaskRunning = latestScanTask.data !== undefined && isTaskActive(latestScanTask.data);
  const isRssTaskRunning = latestRssTask.data !== undefined && isTaskActive(latestRssTask.data);
  const scanMutation = createTriggerScanMutation();
  const rssMutation = createTriggerRssCheckMutation();

  const handleScan = () => {
    scanMutation.mutate(undefined, {
      onSuccess: (accepted) => {
        setLatestScanTaskId(accepted.task_id);
      },
    });
  };

  const handleRss = () => {
    rssMutation.mutate(undefined, {
      onSuccess: (accepted) => {
        setLatestRssTaskId(accepted.task_id);
      },
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">System Status</CardTitle>
          <ActivityIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{status.data ? status.data.version : "-"}</div>
          <p className="text-xs text-muted-foreground">
            Uptime: {status.data ? formatUptime(status.data.uptime) : "-"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Disk Space</CardTitle>
          <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {status.data ? formatBytes(status.data.disk_space.free) : "-"}
          </div>
          <p className="text-xs text-muted-foreground">
            Free of {status.data ? formatBytes(status.data.disk_space.total) : "-"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending Downloads</CardTitle>
          <DownloadIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {status.data ? status.data.pending_downloads : "0"}
          </div>
          <p className="text-xs text-muted-foreground">
            Active Torrents: {status.data ? status.data.active_torrents : "0"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Metadata</CardTitle>
          <CloudIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {status.data ? formatRelativeTime(status.data.last_metadata_refresh) : "-"}
          </div>
          <p className="text-xs text-muted-foreground">Last refresh</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {status.data && (
              <>
                <span className="text-xs text-muted-foreground">
                  {formatProviderStatus("AniDB", status.data.metadata_providers.anidb)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatProviderStatus("Jikan", status.data.metadata_providers.jikan)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatProviderStatus("Manami", status.data.metadata_providers.manami)}
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
          <ArrowClockwiseIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScan}
            disabled={scanMutation.isPending || isScanTaskRunning}
          >
            Scan Lib
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRss}
            disabled={rssMutation.isPending || isRssTaskRunning}
          >
            Check RSS
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
