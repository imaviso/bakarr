import { Badge } from "@/components/ui/badge";
import { cn } from "@/infra/utils";

export type StatTone = "default" | "success" | "warning" | "info";

const toneClasses: Record<StatTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
};

/**
 * Label + value pair for dashboards and detail headers. `inline` renders
 * label-first in a row; the default renders a baseline-aligned value + label.
 */
export function StatItem(props: {
  label: string;
  value: number | string;
  tone?: StatTone | undefined;
  sub?: string | undefined;
  inline?: boolean;
}) {
  const tone = props.tone ?? "default";

  if (props.inline) {
    return (
      <div
        aria-label={`${props.label}: ${props.value}`}
        className={cn("min-w-28 border px-3 py-2 text-right", toneClass(tone))}
      >
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {props.label}
        </span>
        <div className={cn("text-lg font-medium", toneClasses[tone])}>{props.value}</div>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-2">
      <span className={cn("text-xl font-medium tabular-nums", toneClasses[tone])}>
        {props.value}
      </span>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      {props.sub && (
        <Badge variant="secondary" className="h-4 px-1.5 py-0 text-xs">
          {props.sub}
        </Badge>
      )}
    </div>
  );
}

function toneClass(tone: StatTone) {
  if (tone === "info") return "border-info/20 bg-info/5";
  if (tone === "warning") return "border-warning/20 bg-warning/5";
  if (tone === "success") return "border-success/20 bg-success/5";
  return "border-border bg-background/80";
}
