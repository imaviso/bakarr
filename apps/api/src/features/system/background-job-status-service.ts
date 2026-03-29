import { Context, Effect, Layer } from "effect";

import type { BackgroundJobStatus } from "../../../../../packages/shared/src/index.ts";
import type { DatabaseError } from "../../db/database.ts";
import { Database } from "../../db/database.ts";
import { BackgroundWorkerMonitor } from "../../background-monitor.ts";
import { composeBackgroundJobStatuses } from "./background-status.ts";
import {
  ConfigValidationError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
} from "./errors.ts";
import { listBackgroundJobRows } from "./repository/stats-repository.ts";
import { SystemConfigService } from "./system-config-service.ts";

export type BackgroundJobStatusError =
  | DatabaseError
  | ConfigValidationError
  | StoredConfigCorruptError
  | StoredConfigMissingError;

export interface BackgroundJobStatusSnapshot {
  readonly jobs: BackgroundJobStatus[];
  readonly runningJobs: number;
}

export interface BackgroundJobStatusServiceShape {
  readonly getSnapshot: () => Effect.Effect<BackgroundJobStatusSnapshot, BackgroundJobStatusError>;
}

export class BackgroundJobStatusService extends Context.Tag(
  "@bakarr/api/BackgroundJobStatusService",
)<BackgroundJobStatusService, BackgroundJobStatusServiceShape>() {}

const makeBackgroundJobStatusService = Effect.gen(function* () {
  const { db } = yield* Database;
  const monitor = yield* BackgroundWorkerMonitor;
  const configService = yield* SystemConfigService;

  const getSnapshot = Effect.fn("BackgroundJobStatusService.getSnapshot")(function* () {
    const currentConfig = yield* configService.getConfig();
    const jobRows = yield* listBackgroundJobRows(db);
    const liveSnapshot = yield* monitor.snapshot();
    const jobs = composeBackgroundJobStatuses(currentConfig, liveSnapshot, jobRows);

    return {
      jobs,
      runningJobs: jobs.filter((job) => job.is_running).length,
    } satisfies BackgroundJobStatusSnapshot;
  });

  return {
    getSnapshot,
  } satisfies BackgroundJobStatusServiceShape;
});

export const BackgroundJobStatusServiceLive = Layer.effect(
  BackgroundJobStatusService,
  makeBackgroundJobStatusService,
);
