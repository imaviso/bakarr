import {
  IconActivity,
  IconCloud,
  IconDatabase,
  IconDownload,
  IconRefresh,
} from "@tabler/icons-solidjs";
import { Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  createSystemStatusQuery,
  createTriggerRssCheckMutation,
  createTriggerScanMutation,
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
  const scanMutation = createTriggerScanMutation();
  const rssMutation = createTriggerRssCheckMutation();

  const handleScan = () => {
    scanMutation.mutate();
  };

  const handleRss = () => {
    rssMutation.mutate();
  };

  return (
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
          <CardTitle class="text-sm font-medium">Metadata</CardTitle>
          <IconCloud class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">
            <Show when={status.data} fallback="-">
              {(data) => formatRelativeTime(data().last_metadata_refresh)}
            </Show>
          </div>
          <p class="text-xs text-muted-foreground">Last refresh</p>
          <div class="flex flex-wrap gap-1 mt-1">
            <Show when={status.data}>
              {(data) => (
                <>
                  <span class="text-xs text-muted-foreground">
                    {formatProviderStatus("AniDB", data().metadata_providers.anidb)}
                  </span>
                  <span class="text-xs text-muted-foreground">
                    {formatProviderStatus("Jikan", data().metadata_providers.jikan)}
                  </span>
                  <span class="text-xs text-muted-foreground">
                    {formatProviderStatus("Manami", data().metadata_providers.manami)}
                  </span>
                </>
              )}
            </Show>
          </div>
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
          <Button variant="outline" size="sm" onClick={handleRss} disabled={rssMutation.isPending}>
            Check RSS
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
