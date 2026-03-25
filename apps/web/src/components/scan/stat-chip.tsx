import { cn } from "~/lib/utils";

export function StatChip(props: { label: string; value: string; tone?: "default" | "info" }) {
  return (
    <div
      aria-label={`${props.label}: ${props.value}`}
      class={cn(
        "min-w-[112px] border px-3 py-2 text-right shadow-sm",
        props.tone === "info" ? "border-info/20 bg-info/5" : "border-border/70 bg-background/80",
      )}
    >
      <div class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {props.label}
      </div>
      <div class="text-lg font-semibold text-foreground">{props.value}</div>
    </div>
  );
}
