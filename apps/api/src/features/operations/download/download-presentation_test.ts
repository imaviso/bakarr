import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import { downloads } from "@/db/schema.ts";
import {
  toDownload,
  toDownloadStatus,
} from "@/features/operations/download/download-presentation.ts";

type DownloadRow = typeof downloads.$inferSelect;

function makeDownloadRow(overrides: Partial<DownloadRow>): DownloadRow {
  return {
    addedAt: "2025-01-01T00:00:00.000Z",
    animeId: 1,
    animeTitle: "Show",
    contentPath: "/downloads/Show - 01.mkv",
    coveredEpisodes: null,
    downloadDate: null,
    downloadedBytes: 0,
    episodeNumber: 1,
    errorMessage: null,
    etaSeconds: null,
    externalState: null,
    groupName: null,
    id: 10,
    infoHash: "abc123",
    isBatch: false,
    lastErrorAt: null,
    lastSyncedAt: null,
    magnet: null,
    progress: 0,
    reconciledAt: null,
    retryCount: 0,
    savePath: null,
    sourceMetadata: null,
    speedBytes: 0,
    status: "queued",
    torrentName: "Show - 01",
    totalBytes: 0,
    ...overrides,
  };
}

it.effect("toDownload exposes status-specific allowed actions", () =>
  Effect.gen(function* () {
    assert.deepStrictEqual(
      (yield* toDownload(makeDownloadRow({ status: "downloading" }))).allowed_actions,
      ["delete", "pause"],
    );
    assert.deepStrictEqual(
      (yield* toDownload(makeDownloadRow({ status: "paused" }))).allowed_actions,
      ["delete", "resume"],
    );
    assert.deepStrictEqual(
      (yield* toDownload(makeDownloadRow({ status: "failed" }))).allowed_actions,
      ["delete", "retry"],
    );
    assert.deepStrictEqual(
      (yield* toDownload(makeDownloadRow({ reconciledAt: null, status: "completed" })))
        .allowed_actions,
      ["delete", "reconcile"],
    );
    assert.deepStrictEqual(
      (yield* toDownload(
        makeDownloadRow({ reconciledAt: "2025-01-01T01:00:00.000Z", status: "completed" }),
      )).allowed_actions,
      ["delete"],
    );
  }),
);

it.effect("toDownloadStatus clamps progress and exposes runtime actions", () =>
  Effect.gen(function* () {
    const downloading = yield* toDownloadStatus(
      makeDownloadRow({ progress: 150, status: "downloading" }),
    );
    assert.deepStrictEqual(downloading.progress, 1);
    assert.deepStrictEqual(downloading.allowed_actions, ["pause"]);

    const failed = yield* toDownloadStatus(makeDownloadRow({ progress: -10, status: "error" }));
    assert.deepStrictEqual(failed.progress, 0);
    assert.deepStrictEqual(failed.allowed_actions, ["retry", "resume"]);

    const completed = yield* toDownloadStatus(makeDownloadRow({ status: "completed" }));
    assert.deepStrictEqual(completed.allowed_actions, undefined);
  }),
);

it.effect("toDownload marks batch coverage pending only when covered episodes are empty", () =>
  Effect.gen(function* () {
    const pending = yield* toDownload(makeDownloadRow({ coveredEpisodes: null, isBatch: true }));
    const covered = yield* toDownload(makeDownloadRow({ coveredEpisodes: "[1,2]", isBatch: true }));

    assert.deepStrictEqual(pending.coverage_pending, true);
    assert.deepStrictEqual(covered.coverage_pending, undefined);
    assert.deepStrictEqual(covered.covered_episodes, [1, 2]);
  }),
);
