import type {
  BackgroundJobStatus,
  Config,
} from "../../../../../packages/shared/src/index.ts";
import {
  BACKGROUND_JOB_NAMES,
  BACKGROUND_WORKER_NAMES,
  type BackgroundWorkerName,
  type BackgroundWorkerSnapshot,
} from "../../background-worker-model.ts";
import { toBackgroundJobStatus } from "./support.ts";

export interface BackgroundJobHistoryRow {
  readonly isRunning: boolean;
  readonly lastMessage: string | null;
  readonly lastRunAt: string | null;
  readonly lastStatus: string | null;
  readonly lastSuccessAt: string | null;
  readonly name: string;
  readonly progressCurrent: number | null;
  readonly progressTotal: number | null;
  readonly runCount: number;
}

export function composeBackgroundJobStatuses(
  config: Config,
  liveSnapshot: BackgroundWorkerSnapshot,
  rows: ReadonlyArray<BackgroundJobHistoryRow>,
): BackgroundJobStatus[] {
  const rowsByName = new Map(rows.map((row) => [row.name, row] as const));
  const names = [
    ...new Set([...BACKGROUND_JOB_NAMES, ...rows.map((row) => row.name)]),
  ].sort();

  return names.map((name) =>
    composeBackgroundJobStatus(config, liveSnapshot, rowsByName.get(name), name)
  );
}

export function composeBackgroundJobStatus(
  config: Config,
  liveSnapshot: BackgroundWorkerSnapshot,
  row: BackgroundJobHistoryRow | undefined,
  name: string,
): BackgroundJobStatus {
  const base = toBackgroundJobStatus(config, row, name);
  const live = isBackgroundWorkerName(name) ? liveSnapshot[name] : undefined;

  if (!live) {
    return base;
  }

  const lastRunAt = maxIsoTimestamp(base.last_run_at, live.lastStartedAt);
  const lastSuccessAt = maxIsoTimestamp(
    base.last_success_at,
    live.lastSucceededAt,
  );
  const latestStatusEvent = latestStatusCandidate(base, live);

  return {
    ...base,
    is_running: live.runRunning,
    last_message: live.runRunning
      ? base.last_message
      : latestStatusEvent.message ?? base.last_message,
    last_run_at: lastRunAt,
    last_status: live.runRunning
      ? "running"
      : latestStatusEvent.status ?? base.last_status,
    last_success_at: lastSuccessAt,
    run_count: row?.runCount ??
      live.successCount + live.failureCount + live.skipCount,
  } satisfies BackgroundJobStatus;
}

export function countRunningBackgroundJobStatuses(
  jobs: ReadonlyArray<BackgroundJobStatus>,
) {
  return jobs.filter((job) => job.is_running).length;
}

export function findBackgroundJobStatus(
  jobs: ReadonlyArray<BackgroundJobStatus>,
  name: string,
) {
  return jobs.find((job) => job.name === name);
}

function isBackgroundWorkerName(name: string): name is BackgroundWorkerName {
  return BACKGROUND_WORKER_NAMES.some((workerName) => workerName === name);
}

function latestStatusCandidate(
  base: BackgroundJobStatus,
  live: BackgroundWorkerSnapshot[BackgroundWorkerName],
) {
  type Candidate = {
    at: string;
    message: string | undefined;
    status: string;
  };

  const candidates = [
    base.last_run_at && base.last_status &&
      (live.runRunning || base.last_status !== "running")
      ? {
        at: base.last_run_at,
        message: base.last_message,
        status: base.last_status,
      }
      : undefined,
    live.lastFailedAt
      ? {
        at: live.lastFailedAt,
        message: live.lastErrorMessage ?? undefined,
        status: "failed",
      }
      : undefined,
    live.lastSucceededAt
      ? {
        at: live.lastSucceededAt,
        message: undefined,
        status: "success",
      }
      : undefined,
  ].filter((candidate): candidate is Candidate => candidate !== undefined);

  return candidates.sort((left, right) =>
    right!.at.localeCompare(left!.at)
  )[0] ?? {
    message: undefined,
    status: undefined,
  };
}

function maxIsoTimestamp(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (!left) {
    return right ?? undefined;
  }

  if (!right) {
    return left;
  }

  return left.localeCompare(right) >= 0 ? left : right;
}
