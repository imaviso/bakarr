import { Effect, Layer } from "effect";
import { eq } from "drizzle-orm";

import { assert, it } from "@effect/vitest";
import * as schema from "@/db/schema.ts";
import { downloads, media } from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import {
  makeDownloadRepository,
  makeMediaRepository,
  makeMediaUnitRepository,
} from "@/test/repository-factories.ts";
import { makeTestFileSystemEffect } from "@/test/filesystem-test.ts";
import { EventBusNoopLive } from "@/features/events/event-bus.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe, MediaProbeNoMetadata } from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";

it.scoped("reconcile releases the claim when the download content is unreachable", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        yield* tryDatabasePromise("Failed to seed media for reconcile test", () =>
          db.insert(media).values(makeReconcileMediaRow()),
        );
        yield* tryDatabasePromise("Failed to seed download for reconcile test", () =>
          db.insert(downloads).values({
            addedAt: "2024-01-01T00:00:00.000Z",
            contentPath: "/missing/reconcilable.mkv",
            infoHash: "hash-unreachable",
            mediaId: 1,
            mediaTitle: "Naruto",
            status: "completed",
            torrentName: "Naruto - 01",
            unitNumber: 1,
          }),
        );

        const serviceLayer = yield* makeReconcileServiceLayer(db, databaseFile);
        const service = yield* DownloadReconciliationService.pipe(Effect.provide(serviceLayer));

        yield* service.reconcileCompletedTorrentEffect(
          "hash-unreachable",
          "/missing/reconcilable.mkv",
        );

        // the claim was released on early exit; no token is left behind
        assert.deepStrictEqual(yield* loadReconciledAt(db, 1), null);

        // a retry can claim again — no stale token blocks it
        yield* service.reconcileCompletedTorrentEffect(
          "hash-unreachable",
          "/missing/reconcilable.mkv",
        );
        assert.deepStrictEqual(yield* loadReconciledAt(db, 1), null);
      }),
    schema,
  }),
);

it.scoped("reconcile skips downloads already marked reconciled", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        yield* tryDatabasePromise("Failed to seed media for reconcile test", () =>
          db.insert(media).values(makeReconcileMediaRow()),
        );
        yield* tryDatabasePromise("Failed to seed download for reconcile test", () =>
          db.insert(downloads).values({
            addedAt: "2024-01-01T00:00:00.000Z",
            contentPath: "/missing/reconcilable.mkv",
            infoHash: "hash-done",
            mediaId: 1,
            mediaTitle: "Naruto",
            reconciledAt: "2024-02-01T00:00:00.000Z",
            status: "imported",
            torrentName: "Naruto - 01",
            unitNumber: 1,
          }),
        );

        const serviceLayer = yield* makeReconcileServiceLayer(db, databaseFile);
        const service = yield* DownloadReconciliationService.pipe(Effect.provide(serviceLayer));

        yield* service.reconcileCompletedTorrentEffect("hash-done", "/missing/reconcilable.mkv");

        // the timestamp is preserved; the download stays reconciled
        assert.deepStrictEqual(yield* loadReconciledAt(db, 1), "2024-02-01T00:00:00.000Z");
      }),
    schema,
  }),
);

const makeReconcileServiceLayer = (db: AppDatabase, databaseFile: string) =>
  Effect.gen(function* () {
    const fs = yield* makeTestFileSystemEffect();
    return DownloadReconciliationService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(DownloadRepository, makeDownloadRepository(db)),
          EventBusNoopLive,
          Layer.succeed(MediaRepository, makeMediaRepository(db)),
          Layer.succeed(MediaUnitRepository, makeMediaUnitRepository(db)),
          RandomService.Default,
          Layer.succeed(FileSystem, fs),
          Layer.succeed(
            MediaProbe,
            MediaProbe.make({
              probeVideoFile: () => Effect.succeed(new MediaProbeNoMetadata({})),
            }),
          ),
          Layer.succeed(
            TorrentClientService,
            TorrentClientService.make({
              addTorrentUrlIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
              deleteTorrentIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
              listTorrentContentsIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
              listTorrentsIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
              pauseTorrentIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
              resumeTorrentIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
            }),
          ),
          Layer.succeed(
            OperationsProgress,
            OperationsProgress.make({
              getDownloadProgress: () => Effect.succeed([]),
              getDownloadProgressBootstrap: () => Effect.succeed([]),
              getDownloadRuntimeSummary: () => Effect.succeed({ active_count: 0 }),
              publishDownloadProgress: () => Effect.void,
              publishDownloadProgressNow: () => Effect.void,
              publishLibraryScanProgress: () => Effect.void,
              publishRssCheckProgress: () => Effect.void,
            }),
          ),
          Layer.succeed(
            RuntimeConfigSnapshotService,
            RuntimeConfigSnapshotService.make({
              getRuntimeConfig: () => Effect.succeed(makeTestConfig(databaseFile)),
              replaceRuntimeConfig: () => Effect.void,
            }),
          ),
        ),
      ),
    );
  });

const loadReconciledAt = (db: AppDatabase, id: number) =>
  tryDatabasePromise("Failed to load download for reconcile test", () =>
    db
      .select({ reconciledAt: downloads.reconciledAt })
      .from(downloads)
      .where(eq(downloads.id, id))
      .limit(1),
  ).pipe(Effect.map((rows) => rows[0]?.reconciledAt ?? null));

function makeReconcileMediaRow(): typeof media.$inferInsert {
  return {
    addedAt: "2024-01-01T00:00:00.000Z",
    format: "TV",
    genres: "[]",
    id: 1,
    mediaKind: "anime",
    monitored: true,
    profileName: "Default",
    releaseProfileIds: "[]",
    rootFolder: "/library/Naruto",
    status: "RELEASING",
    studios: "[]",
    titleRomaji: "Naruto",
  };
}
