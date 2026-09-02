export type ProgressTone = "warning" | "primary" | "muted";

export function progressTone(
  nextMissingUnit: number | null | undefined,
  monitored: boolean,
): ProgressTone {
  if (nextMissingUnit) return "warning";
  if (monitored) return "primary";
  return "muted";
}
