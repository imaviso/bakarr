import { Badge } from "@/components/ui/badge";

export function StatItem(props: {
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
        <Badge variant="secondary" className="h-4 px-1.5 py-0 text-xs">
          {props.sub}
        </Badge>
      )}
    </div>
  );
}
