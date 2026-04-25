import type { BackgroundJobStatus } from "~/api";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/infra/utils";

interface BackgroundJobCardProps {
  job: BackgroundJobStatus;
  formatTimestamp: (createdAt: string) => string;
}

export function BackgroundJobCard(props: BackgroundJobCardProps) {
  const displayName =
    props.job.name === "metadata_refresh"
      ? "Metadata Refresh"
      : props.job.name.replaceAll("_", " ");

  return (
    <div className="rounded-none border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm capitalize">{displayName}</div>
        <Badge variant="outline" className={cn(props.job.is_running && "border-info/40 text-info")}>
          {props.job.is_running ? "Running" : (props.job.last_status ?? "Idle")}
        </Badge>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div>Runs: {props.job.run_count}</div>
        <div>
          Schedule: {props.job.schedule_mode ?? "manual"}
          {props.job.schedule_value && <span>({props.job.schedule_value})</span>}
        </div>
        <div>
          Last run: {props.job.last_run_at ? props.formatTimestamp(props.job.last_run_at) : "-"}
        </div>
        <div>
          Last success:{" "}
          {props.job.last_success_at ? props.formatTimestamp(props.job.last_success_at) : "-"}
        </div>
        {props.job.last_message && <div className="line-clamp-2">{props.job.last_message}</div>}
      </div>
    </div>
  );
}
