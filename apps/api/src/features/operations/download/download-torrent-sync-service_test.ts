import { Effect, Layer } from "effect";
import { eq } from "drizzle-orm";

import { assert, it } from "@effect/vitest";
import * as schema from "@/db/schema.ts";
import { downloadEvents, downloads, media } from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { AppDrizzleDatabase } from "@/db/database.ts";
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
import type { QBitTorrent } from "@/features/operations/qbittorrent/qbittorrent.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { OperationsTaskRepository } from "@/features/operations/repository/task-repository.ts";
import { OperationsTaskWriteService } from "@/features/operations/tasks/operations-task-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";
import {
  buildClaimToken,
  isClaimToken,
} from "@/features/operations/download/download-claim-token.ts";
import { DownloadTorrentSyncService } from "@/features/operations/download/download-torrent-sync-service.ts";

// `it.scoped` runs the service under the TestClock, whose `nowIso()` starts at
// the epoch — so seeded claim/sync timestamps are offsets from epoch zero.
const minutesAgoIso = (minutes: number) => new Date(-minutes * 60 * 1000).toISOString();

const makeTorrent = (hash: string): QBitTorrent => ({
  content_path: `/downloads/${hash}`,
  downloaded: 100,
  dlspeed: 0,
  eta: 0,
  hash,
  name: `torrent-${hash}`,
  progress: 1,
  save_path: "/downloads",
  size: 100,
  state: "pausedUP",
});

const makeSyncServiceLayer = (db: AppDatabase, databaseFile: string) =>
  Effect.gen(function* () {
    const fs = yield* makeTestFileSystemEffect();
    const appDbLayer = Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.make(db));
    const taskWriteLayer = OperationsTaskWriteService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          OperationsTaskRepository.DefaultWithoutDependencies.pipe(Layer.provide(appDbLayer)),
          EventBusNoopLive,
        ),
      ),
    );
    const launcherLayer = OperationsTaskLauncherService.DefaultWithoutDependencies.pipe(
      Layer.provide(taskWriteLayer),
    );
    const reconciliationLayer = DownloadReconciliationService.DefaultWithoutDependencies.pipe(
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
              getRuntimeConfig: () =>
                Effect.succeed(
                  makeTestConfig(databaseFile, (c) => ({
                    ...c,
                    downloads: { ...c.downloads, reconcile_completed_downloads: false },
                  })),
                ),
              replaceRuntimeConfig: () => Effect.void,
            }),
          ),
        ),
      ),
    );

    return DownloadTorrentSyncService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          reconciliationLayer,
          Layer.succeed(DownloadRepository, makeDownloadRepository(db)),
          EventBusNoopLive,
          Layer.succeed(MediaRepository, makeMediaRepository(db)),
          launcherLayer,
          Layer.succeed(
            TorrentClientService,
            TorrentClientService.make({
              addTorrentUrlIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
              deleteTorrentIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
              listTorrentContentsIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
              listTorrentsIfEnabled: () =>
                Effect.succeed({
                  _tag: "Found",
                  torrents: [makeTorrent("hash-fresh-claim"), makeTorrent("hash-stale-claim")],
                }),
              pauseTorrentIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
              resumeTorrentIfEnabled: () => Effect.succeed({ _tag: "Disabled" }),
            }),
          ),
          Layer.succeed(
            RuntimeConfigSnapshotService,
            RuntimeConfigSnapshotService.make({
              getRuntimeConfig: () =>
                Effect.succeed(
                  makeTestConfig(databaseFile, (c) => ({
                    ...c,
                    downloads: { ...c.downloads, reconcile_completed_downloads: false },
                  })),
                ),
              replaceRuntimeConfig: () => Effect.void,
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
        ),
      ),
    );
  });

const seedMedia = (db: AppDatabase) =>
  tryDatabasePromise("Failed to seed media for sync test", () =>
    db.insert(media).values({
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
    }),
  );

interface SeededDownloadInput {
  readonly infoHash: string;
  readonly reconciledAt?: string | null;
  readonly status: string;
  readonly lastSyncedAt?: string;
}

const seedDownload = (db: AppDatabase, input: SeededDownloadInput) =>
  tryDatabasePromise("Failed to seed download for sync test", () =>
    db.insert(downloads).values({
      addedAt: "2024-01-01T00:00:00.000Z",
      contentPath: `/downloads/${input.infoHash}`,
      infoHash: input.infoHash,
      lastSyncedAt: input.lastSyncedAt ?? minutesAgoIso(1),
      mediaId: 1,
      mediaTitle: "Naruto",
      reconciledAt: input.reconciledAt ?? null,
      status: input.status,
      torrentName: `torrent-${input.infoHash}`,
      unitNumber: 1,
    }),
  );

const loadDownloadRow = (db: AppDatabase, infoHash: string) =>
  tryDatabasePromise("Failed to load download for sync test", () =>
    db.select().from(downloads).where(eq(downloads.infoHash, infoHash)).limit(1),
  ).pipe(Effect.map((rows) => rows[0]));

it.scoped("sync treats a fresh claim as not imported and leaves it for retry", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        yield* seedMedia(db);
        const freshClaim = buildClaimToken(minutesAgoIso(5), "fresh-uuid");
        yield* seedDownload(db, {
          infoHash: "hash-fresh-claim",
          reconciledAt: freshClaim,
          status: "completed",
        });

        const serviceLayer = yield* makeSyncServiceLayer(db, databaseFile);
        const service = yield* DownloadTorrentSyncService.pipe(Effect.provide(serviceLayer));

        yield* service.syncDownloadsWithQBitEffect();

        const row = yield* loadDownloadRow(db, "hash-fresh-claim");
        // Fresh claim is NOT swept and NOT treated as imported
        assert.deepStrictEqual(row?.reconciledAt, freshClaim);
        assert.deepStrictEqual(isClaimToken(row?.reconciledAt), true);
        // preservedImported=false means raw qBittorrent state wins over "imported"
        assert.deepStrictEqual(row?.externalState, "pausedUP");
        assert.deepStrictEqual(row?.status, "completed");
      }),
    schema,
  }),
);

it.scoped("sync sweeps stale claims so auto-reconcile can retry", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        yield* seedMedia(db);
        const staleClaim = buildClaimToken(minutesAgoIso(31), "stale-uuid");
        yield* seedDownload(db, {
          infoHash: "hash-stale-claim",
          reconciledAt: staleClaim,
          status: "completed",
        });

        const serviceLayer = yield* makeSyncServiceLayer(db, databaseFile);
        const service = yield* DownloadTorrentSyncService.pipe(Effect.provide(serviceLayer));

        yield* service.syncDownloadsWithQBitEffect();

        const row = yield* loadDownloadRow(db, "hash-stale-claim");
        assert.deepStrictEqual(row?.reconciledAt, null);
      }),
    schema,
  }),
);

it.scoped("sync marks phantom queued rows failed with an event", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        yield* seedMedia(db);
        yield* seedDownload(db, {
          infoHash: "hash-lost-in-qbit",
          lastSyncedAt: minutesAgoIso(11),
          status: "queued",
        });

        const serviceLayer = yield* makeSyncServiceLayer(db, databaseFile);
        const service = yield* DownloadTorrentSyncService.pipe(Effect.provide(serviceLayer));

        yield* service.syncDownloadsWithQBitEffect();

        const row = yield* loadDownloadRow(db, "hash-lost-in-qbit");
        assert.deepStrictEqual(row?.status, "failed");
        assert.deepStrictEqual(
          row?.errorMessage,
          "qBittorrent no longer reports this queued download",
        );

        const events = yield* tryDatabasePromise("Failed to load events for sync test", () =>
          db
            .select()
            .from(downloadEvents)
            .where(eq(downloadEvents.downloadId, row?.id ?? -1)),
        );
        assert.deepStrictEqual(events.length, 1);
        assert.deepStrictEqual(events[0]?.eventType, "download.failed");
        assert.deepStrictEqual(events[0]?.fromStatus, "queued");
        assert.deepStrictEqual(events[0]?.toStatus, "failed");
      }),
    schema,
  }),
);

it.scoped("sync writes status-change events in the same pass as the update", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        yield* seedMedia(db);
        yield* seedDownload(db, {
          infoHash: "hash-fresh-claim",
          lastSyncedAt: minutesAgoIso(1),
          status: "downloading",
        });

        const serviceLayer = yield* makeSyncServiceLayer(db, databaseFile);
        const service = yield* DownloadTorrentSyncService.pipe(Effect.provide(serviceLayer));

        yield* service.syncDownloadsWithQBitEffect();

        const row = yield* loadDownloadRow(db, "hash-fresh-claim");
        assert.deepStrictEqual(row?.status, "completed");

        const events = yield* tryDatabasePromise("Failed to load events for sync test", () =>
          db
            .select()
            .from(downloadEvents)
            .where(eq(downloadEvents.downloadId, row?.id ?? -1)),
        );
        assert.deepStrictEqual(events.length, 1);
        assert.deepStrictEqual(events[0]?.eventType, "download.status_changed");
        assert.deepStrictEqual(events[0]?.fromStatus, "downloading");
        assert.deepStrictEqual(events[0]?.toStatus, "completed");
      }),
    schema,
  }),
);
