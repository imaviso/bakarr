import { cn } from "@/infra/utils";
import { SectionLabel } from "@/components/shared/section-label";

export function StatChip(props: { label: string; value: string; tone?: "default" | "info" }) {
  return (
    <div
      aria-label={`${props.label}: ${props.value}`}
      className={cn(
        "min-w-[112px] border px-3 py-2 text-right ",
        props.tone === "info" ? "border-info/20 bg-info/5" : "border-border bg-background/80",
      )}
    >
      <SectionLabel as="div">{props.label}</SectionLabel>
      <div className="text-lg font-medium text-foreground">{props.value}</div>
    </div>
  );
}
