import { cn } from "@/infra/utils";

type ProgressTone = "warning" | "primary" | "muted";

interface MediaProgressBarProps {
  percent: number | null;
  tone: ProgressTone;
}

const toneClass: Record<ProgressTone, string> = {
  warning: "bg-warning",
  primary: "bg-primary",
  muted: "bg-muted-foreground/40",
};

export function MediaProgressBar(props: MediaProgressBarProps) {
  return (
    <div className="h-1.5 overflow-hidden bg-muted">
      <div
        className={cn(
          "h-full origin-left transition-transform duration-300 ease-out",
          toneClass[props.tone],
        )}
        style={{ transform: `scaleX(${(props.percent ?? 0) / 100})` }}
      />
    </div>
  );
}

export function progressTone(
  nextMissingUnit: number | null | undefined,
  monitored: boolean,
): ProgressTone {
  if (nextMissingUnit) return "warning";
  if (monitored) return "primary";
  return "muted";
}
