import { assert, it } from "@effect/vitest";

import { downloads } from "@/db/schema.ts";
import { Effect } from "effect";
import {
  toDownload,
  toDownloadStatus,
} from "@/features/operations/download/download-presentation.ts";

type DownloadRow = typeof downloads.$inferSelect;

function makeDownloadRow(overrides: Partial<DownloadRow>): DownloadRow {
  return {
    addedAt: "2025-01-01T00:00:00.000Z",
    mediaId: 1,
    mediaTitle: "Show",
    contentPath: "/downloads/Show - 01.mkv",
    coveredUnits: null,
    downloadDate: null,
    downloadedBytes: 0,
    unitNumber: 1,
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
    assert.deepStrictEqual(downloading.allowed_actions, ["delete", "pause"]);

    const failed = yield* toDownloadStatus(makeDownloadRow({ progress: -10, status: "error" }));
    assert.deepStrictEqual(failed.progress, 0);
    assert.deepStrictEqual(failed.allowed_actions, ["delete", "retry", "resume"]);

    const completed = yield* toDownloadStatus(makeDownloadRow({ status: "completed" }));
    assert.deepStrictEqual(completed.allowed_actions, ["delete"]);
  }),
);

it.effect("toDownload marks batch coverage pending only when covered mediaUnits are empty", () =>
  Effect.gen(function* () {
    const pending = yield* toDownload(makeDownloadRow({ coveredUnits: null, isBatch: true }));
    const covered = yield* toDownload(makeDownloadRow({ coveredUnits: "[1,2]", isBatch: true }));

    assert.deepStrictEqual(pending.coverage_pending, true);
    assert.deepStrictEqual(covered.coverage_pending, undefined);
    assert.deepStrictEqual(covered.covered_units, [1, 2]);
  }),
);

it.effect("a claim token in reconciledAt keeps the download actionable", () =>
  Effect.gen(function* () {
    const claimed = yield* toDownload(
      makeDownloadRow({
        reconciledAt: "claim:2025-01-01T00:00:00.000Z:uuid",
        status: "completed",
      }),
    );

    // Claim = import in flight/crashed: reconcile stays available and no fake
    // timestamp leaks into the presentation.
    assert.deepStrictEqual(claimed.allowed_actions, ["delete", "reconcile"]);
    assert.deepStrictEqual(claimed.reconciled_at, undefined);

    const finalized = yield* toDownload(
      makeDownloadRow({ reconciledAt: "2025-01-01T01:00:00.000Z", status: "completed" }),
    );
    assert.deepStrictEqual(finalized.allowed_actions, ["delete"]);
    assert.deepStrictEqual(finalized.reconciled_at, "2025-01-01T01:00:00.000Z");
  }),
);
