import { cn } from "@/infra/utils";

type StatDotVariant = "success" | "warning" | "muted" | "info";

const variantClass: Record<StatDotVariant, string> = {
  success: "bg-success ring-1 ring-success/40",
  warning: "bg-warning ring-1 ring-warning/40",
  muted: "bg-muted-foreground/40",
  info: "bg-info ring-1 ring-info/40",
};

interface StatDotProps {
  variant?: StatDotVariant;
  className?: string;
}

export function StatDot(props: StatDotProps) {
  const variant = props.variant ?? "muted";
  return (
    <span
      className={cn("inline-block size-1.5 rounded-full", variantClass[variant], props.className)}
    />
  );
}
