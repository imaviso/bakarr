import { cn } from "~/infra/utils";

interface DashboardMetricCardProps {
  label: string;
  value: number;
  highlight?: string | undefined;
}

export function DashboardMetricCard(props: DashboardMetricCardProps) {
  return (
    <div
      aria-label={`${props.label}: ${props.value}`}
      className="rounded-none border border-border bg-card p-3 space-y-1"
    >
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className={cn("text-2xl font-medium", props.highlight)}>{props.value}</div>
    </div>
  );
}
