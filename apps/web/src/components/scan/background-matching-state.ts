import type { BackgroundJobStatus } from "~/lib/api";

export interface BackgroundMatchingStateInput {
  failedCount: number;
  hasOutstandingWork: boolean;
  job?: BackgroundJobStatus;
  matchingCount: number;
  pausedCount: number;
}

export function isBackgroundMatchingRunning(
  input: BackgroundMatchingStateInput,
) {
  return input.matchingCount > 0 ||
    Boolean(input.job?.is_running && input.hasOutstandingWork);
}

export function backgroundMatchingStatusLabel(
  input: BackgroundMatchingStateInput,
) {
  if (isBackgroundMatchingRunning(input)) {
    return "Running";
  }

  if (input.failedCount > 0 && input.hasOutstandingWork) {
    return "Retrying";
  }

  if (input.hasOutstandingWork) {
    return "Scheduled";
  }

  if (input.pausedCount > 0) {
    return "Paused";
  }

  if (input.job?.last_status === "failed") {
    return "Failed";
  }

  return "Idle";
}

export function backgroundMatchingStatusVariant(
  input: BackgroundMatchingStateInput,
): "outline" | "warning" | "error" {
  if (
    isBackgroundMatchingRunning(input) || input.hasOutstandingWork ||
    input.pausedCount > 0
  ) {
    return "warning";
  }

  if (input.failedCount > 0 || input.job?.last_status === "failed") {
    return "error";
  }

  return "outline";
}
