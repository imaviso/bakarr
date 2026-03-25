import { assertEquals, it } from "../../test/vitest.ts";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { initialBackgroundWorkerSnapshot } from "../../background-worker-model.ts";
import { makeDefaultConfig } from "./defaults.ts";
import {
  composeBackgroundJobStatuses,
  countRunningBackgroundJobStatuses,
  findBackgroundJobStatus,
} from "./background-status.ts";

it("background status composes persisted job rows with live running state", () => {
  const config: Config = {
    ...makeDefaultConfig("./test.sqlite"),
    profiles: [],
  };
  const snapshot = {
    ...initialBackgroundWorkerSnapshot(),
    rss: {
      ...initialBackgroundWorkerSnapshot().rss,
      daemonRunning: true,
      lastStartedAt: "2024-01-03T00:00:00.000Z",
      runRunning: true,
      successCount: 1,
    },
  };

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

  assertEquals(rssJob?.is_running, true);
  assertEquals(rssJob?.last_status, "running");
  assertEquals(rssJob?.last_run_at, "2024-01-03T00:00:00.000Z");
  assertEquals(rssJob?.run_count, 4);
  assertEquals(countRunningBackgroundJobStatuses(jobs), 1);
});

it("background status falls back to live failure details for workers without history rows", () => {
  const config: Config = {
    ...makeDefaultConfig("./test.sqlite"),
    profiles: [],
  };
  const snapshot = {
    ...initialBackgroundWorkerSnapshot(),
    download_sync: {
      ...initialBackgroundWorkerSnapshot().download_sync,
      failureCount: 1,
      lastErrorMessage: "sync failed",
      lastFailedAt: "2024-01-04T00:00:00.000Z",
    },
  };

  const jobs = composeBackgroundJobStatuses(config, snapshot, []);
  const downloadSyncJob = findBackgroundJobStatus(jobs, "download_sync");
  const metadataRefreshJob = findBackgroundJobStatus(jobs, "metadata_refresh");

  assertEquals(downloadSyncJob?.last_status, "failed");
  assertEquals(downloadSyncJob?.last_message, "sync failed");
  assertEquals(downloadSyncJob?.run_count, 1);
  assertEquals(metadataRefreshJob?.schedule_value, "24h");
});
