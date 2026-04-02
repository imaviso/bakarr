import { Context, Effect, Layer } from "effect";

import type { SystemStatus } from "@packages/shared/index.ts";
import { AppConfig } from "@/config.ts";
import { AppRuntime } from "@/app-runtime.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import {
  BackgroundJobStatusError,
  BackgroundJobStatusService,
} from "@/features/system/background-job-status-service.ts";
import { findBackgroundJobStatus } from "@/features/system/background-status.ts";
import {
  DiskSpaceError,
  DiskSpaceInspector,
  selectStoragePath,
} from "@/features/system/disk-space.ts";
import { loadSystemDownloadStatsAggregate } from "@/features/system/repository/stats-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "@/features/system/errors.ts";
import { ClockService } from "@/lib/clock.ts";

export type SystemStatusReadError =
  | BackgroundJobStatusError
  | DatabaseError
  | DiskSpaceError
  | StoredConfigCorruptError
  | StoredConfigMissingError;

export interface SystemStatusReadServiceShape {
  readonly getSystemStatus: () => Effect.Effect<SystemStatus, SystemStatusReadError>;
}

export class SystemStatusReadService extends Context.Tag("@bakarr/api/SystemStatusReadService")<
  SystemStatusReadService,
  SystemStatusReadServiceShape
>() {}

export const SystemStatusReadServiceLive = Layer.effect(
  SystemStatusReadService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const appConfig = yield* AppConfig;
    const runtime = yield* AppRuntime;
    const clock = yield* ClockService;
    const diskSpaceInspector = yield* DiskSpaceInspector;
    const backgroundJobStatusService = yield* BackgroundJobStatusService;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    const getSystemStatus = Effect.fn("SystemStatusReadService.getSystemStatus")(function* () {
      const currentConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
      const storagePath = selectStoragePath(currentConfig, appConfig.databaseFile);
      const diskSpace = yield* diskSpaceInspector.getDiskSpaceSafe(storagePath);
      const downloadStats = yield* loadSystemDownloadStatsAggregate(db);
      const snapshot = yield* backgroundJobStatusService.getSnapshot();
      const rssJob = findBackgroundJobStatus(snapshot.jobs, "rss");
      const scanJob = findBackgroundJobStatus(snapshot.jobs, "library_scan");
      const metadataRefreshJob = findBackgroundJobStatus(snapshot.jobs, "metadata_refresh");
      const now = yield* clock.currentTimeMillis;

      return {
        active_torrents: downloadStats.activeDownloads,
        disk_space: { free: diskSpace.free, total: diskSpace.total },
        last_metadata_refresh:
          metadataRefreshJob?.last_success_at ?? metadataRefreshJob?.last_run_at ?? null,
        last_rss: rssJob?.last_success_at ?? rssJob?.last_run_at ?? null,
        last_scan: scanJob?.last_success_at ?? scanJob?.last_run_at ?? null,
        pending_downloads: downloadStats.queuedDownloads,
        uptime: Math.max(0, Math.floor((now - runtime.startedAt.getTime()) / 1000)),
        version: appConfig.appVersion,
      } satisfies SystemStatus;
    });

    return SystemStatusReadService.of({ getSystemStatus });
  }),
);
