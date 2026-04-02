import assert from "node:assert/strict";
import { it } from "@effect/vitest";

import {
  BackgroundWorkerSnapshotModel,
  BackgroundWorkerStatsModel,
  initialBackgroundWorkerSnapshot,
} from "@/background-worker-model.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import {
  composeBackgroundJobStatuses,
  countRunningBackgroundJobStatuses,
  findBackgroundJobStatus,
} from "@/features/system/background-status.ts";

it("background status composes persisted job rows with live running state", () => {
  const config = makeTestConfig("./test.sqlite");
  const baseSnapshot = initialBackgroundWorkerSnapshot();
  const snapshot = new BackgroundWorkerSnapshotModel({
    download_sync: baseSnapshot.download_sync,
    library_scan: baseSnapshot.library_scan,
    metadata_refresh: baseSnapshot.metadata_refresh,
    rss: new BackgroundWorkerStatsModel({
      daemonRunning: true,
      failureCount: 0,
      lastErrorMessage: null,
      lastFailedAt: null,
      lastStartedAt: "2024-01-03T00:00:00.000Z",
      lastSucceededAt: null,
      runRunning: true,
      skipCount: 0,
      successCount: 1,
    }),
  });

  const jobs = composeBackgroundJobStatuses(config, snapshot, [
    {
      isRunning: false,
      lastMessage: "Queued 1 release",
      lastRunAt: "2024-01-02T00:00:00.000Z",
      lastStatus: "success",
      lastSuccessAt: "2024-01-02T00:00:00.000Z",
      name: "rss",
      progressCurrent: null,
      progressTotal: null,
      runCount: 4,
    },
  ]);
  const rssJob = findBackgroundJobStatus(jobs, "rss");

  assert.deepStrictEqual(rssJob?.is_running, true);
  assert.deepStrictEqual(rssJob?.last_status, "running");
  assert.deepStrictEqual(rssJob?.last_run_at, "2024-01-03T00:00:00.000Z");
  assert.deepStrictEqual(rssJob?.run_count, 4);
  assert.deepStrictEqual(countRunningBackgroundJobStatuses(jobs), 1);
});

it("background status falls back to live failure details for workers without history rows", () => {
  const config = makeTestConfig("./test.sqlite");
  const baseSnapshot2 = initialBackgroundWorkerSnapshot();
  const snapshot = new BackgroundWorkerSnapshotModel({
    download_sync: new BackgroundWorkerStatsModel({
      daemonRunning: false,
      failureCount: 1,
      lastErrorMessage: "sync failed",
      lastFailedAt: "2024-01-04T00:00:00.000Z",
      lastStartedAt: null,
      lastSucceededAt: null,
      runRunning: false,
      skipCount: 0,
      successCount: 0,
    }),
    library_scan: baseSnapshot2.library_scan,
    metadata_refresh: baseSnapshot2.metadata_refresh,
    rss: baseSnapshot2.rss,
  });

  const jobs = composeBackgroundJobStatuses(config, snapshot, []);
  const downloadSyncJob = findBackgroundJobStatus(jobs, "download_sync");
  const metadataRefreshJob = findBackgroundJobStatus(jobs, "metadata_refresh");

  assert.deepStrictEqual(downloadSyncJob?.last_status, "failed");
  assert.deepStrictEqual(downloadSyncJob?.last_message, "sync failed");
  assert.deepStrictEqual(downloadSyncJob?.run_count, 1);
  assert.deepStrictEqual(metadataRefreshJob?.schedule_value, "24h");
});
