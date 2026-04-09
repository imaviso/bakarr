import type { BackgroundJobStatus } from "~/lib/api";
import { Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

interface BackgroundJobCardProps {
  job: BackgroundJobStatus;
  formatTimestamp: (createdAt: string) => string;
}

export function BackgroundJobCard(props: BackgroundJobCardProps) {
  const displayName = () =>
    props.job.name === "metadata_refresh"
      ? "Metadata Refresh"
      : props.job.name.replaceAll("_", " ");

  return (
    <div class="rounded-lg border border-border/60 bg-card p-3 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <div class="font-medium text-sm capitalize">{displayName()}</div>
        <Badge variant="outline" class={cn(props.job.is_running && "border-info/40 text-info")}>
          {props.job.is_running ? "Running" : (props.job.last_status ?? "Idle")}
        </Badge>
      </div>
      <div class="space-y-1 text-xs text-muted-foreground">
        <div>Runs: {props.job.run_count}</div>
        <div>
          Schedule: {props.job.schedule_mode ?? "manual"}
          <Show when={props.job.schedule_value}>
            <span>({props.job.schedule_value})</span>
          </Show>
        </div>
        <div>
          Last run: {props.job.last_run_at ? props.formatTimestamp(props.job.last_run_at) : "-"}
        </div>
        <div>
          Last success:{" "}
          {props.job.last_success_at ? props.formatTimestamp(props.job.last_success_at) : "-"}
        </div>
        <Show when={props.job.last_message}>
          <div class="line-clamp-2">{props.job.last_message}</div>
        </Show>
      </div>
    </div>
  );
}
