import { cn } from "~/infra/utils";

export function StatChip(props: { label: string; value: string; tone?: "default" | "info" }) {
  return (
    <div
      aria-label={`${props.label}: ${props.value}`}
      className={cn(
        "min-w-[112px] border px-3 py-2 text-right ",
        props.tone === "info" ? "border-info/20 bg-info/5" : "border-border bg-background/80",
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {props.label}
      </div>
      <div className="text-lg font-semibold text-foreground">{props.value}</div>
    </div>
  );
}
