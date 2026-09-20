import type { ScannerMatchStatus } from "@/api/contracts";

export function backgroundMatchingStatusLabel(status: ScannerMatchStatus) {
  switch (status) {
    case "running":
      return "Running";
    case "retrying":
      return "Retrying";
    case "queued":
      return "Queued";
    case "paused":
      return "Paused";
    case "failed":
      return "Failed";
    default:
      return "Idle";
  }
}

export function backgroundMatchingStatusVariant(
  status: ScannerMatchStatus,
): "outline" | "secondary" | "destructive" {
  if (status === "running" || status === "retrying" || status === "queued" || status === "paused") {
    return "secondary";
  }

  if (status === "failed") {
    return "destructive";
  }

  return "outline";
}
