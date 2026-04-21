import type { BackgroundJobStatus, ScannerMatchStatus } from "~/lib/api";

export interface BackgroundMatchingStateInput {
  failedCount: number;
  hasOutstandingWork: boolean;
  job?: BackgroundJobStatus | undefined;
  matchingCount: number;
  pausedCount: number;
  status?: ScannerMatchStatus | undefined;
}

export function isBackgroundMatchingRunning(input: BackgroundMatchingStateInput) {
  if (input.status !== undefined) {
    return input.status === "running";
  }

  return input.matchingCount > 0 || Boolean(input.job?.is_running && input.hasOutstandingWork);
}

export function backgroundMatchingStatusLabel(input: BackgroundMatchingStateInput) {
  if (input.status !== undefined) {
    return toStatusLabel(input.status);
  }

  if (isBackgroundMatchingRunning(input)) {
    return "Running";
  }

  if (input.failedCount > 0 && input.hasOutstandingWork) {
    return "Retrying";
  }

  if (input.hasOutstandingWork) {
    return "Queued";
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
): "outline" | "secondary" | "destructive" {
  if (input.status !== undefined) {
    return toStatusVariant(input.status);
  }

  if (isBackgroundMatchingRunning(input) || input.hasOutstandingWork || input.pausedCount > 0) {
    return "secondary";
  }

  if (input.failedCount > 0 || input.job?.last_status === "failed") {
    return "destructive";
  }

  return "outline";
}

function toStatusLabel(status: ScannerMatchStatus) {
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

function toStatusVariant(status: ScannerMatchStatus): "outline" | "secondary" | "destructive" {
  if (status === "running" || status === "retrying" || status === "queued" || status === "paused") {
    return "secondary";
  }

  if (status === "failed") {
    return "destructive";
  }

  return "outline";
}
