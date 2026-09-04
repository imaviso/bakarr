// oxlint-disable oxc/no-async-await -- async/await required by transaction callbacks, test callbacks, and tryPromise wrappers

import { Context, Effect, Layer, Stream } from "effect";
import { and, desc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import type {
  DownloadEvent,
  DownloadEventsPage,
  DownloadHistoryPage,
  DownloadSourceMetadata,
} from "@packages/shared/index.ts";
import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { downloadEvents, downloads, systemLogs } from "@/db/schema.ts";
import {
  listDownloadEvents as listDownloadEventsPage,
  listDownloadHistory as listDownloadHistoryPage,
  listRecentDownloadEventRows as listRecentDownloadEventRowsPage,
  loadDownloadEventExportHeader as loadDownloadEventExportHeaderPage,
  loadDownloadEventPresentationContexts,
  loadDownloadStatusStats as loadDownloadStatusStatsPage,
  streamDownloadEvents as streamDownloadEventsPage,
  type DownloadEventExportHeader,
  type DownloadEventExportQuery,
  type DownloadEventListQuery,
  type DownloadStatusStats,
} from "@/features/operations/repository/download-catalog-read.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-catalog-read.ts";
import {
  deleteDownloadRow,
  insertDownloadEventRow,
  toDownloadEventInsert,
  type DownloadEventRecordInput,
  updateDownloadStatusRow,
} from "@/features/operations/repository/download-row-codec.ts";
import type {
  DownloadEventPresentationContext,
  DownloadEventRowLike,
} from "@/features/operations/download/download-event-presentations.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { StoredDataError } from "@/features/errors.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";

export type {
  DownloadEventExportHeader,
  DownloadEventExportQuery,
  DownloadEventListQuery,
  DownloadStatusStats,
} from "@/features/operations/repository/download-catalog-read.ts";
export {
  decodeDownloadSourceMetadata,
  encodeDownloadEventMetadata,
  encodeDownloadSourceMetadata,
  type DownloadEventRecordInput,
} from "@/features/operations/repository/download-row-codec.ts";

type DownloadRow = typeof downloads.$inferSelect;
type TorrentSyncSqlValue = number | string | null;

export interface TorrentSyncUpdate {
  readonly contentPath: string | null;
  readonly downloadedBytes: number;
  readonly downloadDate: string | null;
  readonly errorMessage: string | null;
  readonly etaSeconds: number;
  readonly externalState: string;
  readonly hash: string;
  readonly lastErrorAt: string | null;
  readonly lastSyncedAt: string;
  readonly nextStatus: string;
  readonly progress: number;
  readonly savePath: string | null;
  readonly speedBytes: number;
  readonly status: string;
  readonly torrentName: string;
  readonly totalBytes: number;
}

function buildTorrentSyncCase(
  rows: readonly TorrentSyncUpdate[],
  selectValue: (row: TorrentSyncUpdate) => TorrentSyncSqlValue,
  fallback: SQL,
): SQL {
  return sql`case ${downloads.infoHash} ${sql.join(
    rows.map((row) => sql`when ${row.hash} then ${selectValue(row)}`),
    sql` `,
  )} else ${fallback} end`;
}

export interface DownloadRepositoryShape {
  readonly bulkUpdateTorrentSyncRows: (
    chunk: readonly TorrentSyncUpdate[],
    events: readonly DownloadEventRecordInput[],
    createdAt: string,
  ) => Effect.Effect<void, DatabaseError | StoredDataError>;
  /**
   * Atomic claim: only one concurrent reconcile may import a given download.
   * Sets `reconciledAt` to the token (`claim:<isotimestamp>:<uuid>`) only when
   * it is currently NULL; returns whether the claim was acquired. The token
   * marks an in-flight claim; finalization overwrites it with a timestamp, so
   * a leftover token always means the claim must be released for retry.
   */
  readonly claimDownloadReconciliation: (
    downloadId: number,
    claimToken: string,
  ) => Effect.Effect<boolean, DatabaseError>;
  readonly deleteDownloadRow: (id: number) => Effect.Effect<void, DatabaseError>;
  /**
   * Atomic delete write: deleted event + row removal in one transaction, so a
   * download never disappears without its deletion event.
   */
  readonly deleteDownloadWithEventTx: (input: {
    readonly createdAt: string;
    readonly downloadId: number;
    readonly event: DownloadEventRecordInput;
  }) => Effect.Effect<void, DatabaseError | StoredDataError>;
  /**
   * Phantom-queued sweep: rows stuck in `queued` whose `lastSyncedAt` predates
   * `staleBefore` are absent from qBittorrent's listing (the add was lost).
   * Marks them failed with an event in one transaction; returns swept count.
   * Both timestamps are ISO-8601 UTC (`toISOString`) so SQLite TEXT `lt`
   * is chronologically correct via lexicographic compare.
   */
  readonly failStaleQueuedDownloads: (input: {
    readonly now: string;
    readonly staleBefore: string;
  }) => Effect.Effect<number, DatabaseError>;
  /** Atomic import write: downloads + download_events + system_logs (lifecycle tx). Guarded by claim token. */
  readonly finalizeDownloadImport: (input: {
    readonly claimToken: string;
    readonly downloadId: number;
    readonly fromStatus: string;
    readonly now: string;
    readonly mediaId: number;
    readonly eventType: string;
    readonly eventMessage: string;
    readonly eventMetadata: string | null;
    readonly logEventType: string;
    readonly logMessage: string;
  }) => Effect.Effect<void, DatabaseError>;
  /**
   * Atomic queue-finalize write: status update + queued event in one
   * transaction, so a queued row never observes a status without its event.
   * Called after the qBittorrent add succeeded (or was skipped) and the row
   * insert already happened.
   */
  readonly finalizeQueuedDownloadTx: (input: {
    readonly downloadId: number;
    readonly eventType: string;
    readonly eventMessage: string;
    readonly eventMetadata: string | null;
    readonly eventMetadataJson: {
      readonly covered_units?: readonly number[];
      readonly source_metadata?: DownloadSourceMetadata;
    };
    readonly externalState: string;
    readonly mediaId: number;
    readonly now: string;
    readonly status: string;
  }) => Effect.Effect<void, DatabaseError | StoredDataError>;
  readonly insertDownloadEvent: (
    input: DownloadEventRecordInput,
    createdAt: string,
  ) => Effect.Effect<void, DatabaseError | StoredDataError>;
  /**
   * Atomic status write: status update + lifecycle event in one transaction,
   * so a synced row never observes a status without its event (same guarantee
   * as `finalizeQueuedDownloadTx`).
   */
  readonly updateDownloadStatusWithEventTx: (input: {
    readonly createdAt: string;
    readonly downloadId: number;
    readonly eventType: string;
    readonly eventMessage: string;
    readonly eventMetadataJson: {
      readonly covered_units?: readonly number[];
      readonly source_metadata?: DownloadSourceMetadata;
    };
    readonly externalState: string;
    readonly fromStatus: string;
    readonly mediaId: number;
    readonly status: string;
    readonly toStatus: string;
  }) => Effect.Effect<void, DatabaseError | StoredDataError>;
  readonly insertQueuedDownloadRow: (input: {
    readonly addedAt: string;
    readonly coveredUnits: string | null;
    readonly groupName: string | null;
    readonly infoHash: string | null;
    readonly isBatch: boolean;
    readonly lastSyncedAt: string;
    readonly magnet: string;
    readonly mediaId: number;
    readonly mediaTitle: string;
    readonly sourceMetadata: string;
    readonly torrentName: string;
    readonly totalBytes?: number | null;
    readonly unitNumber: number;
  }) => Effect.Effect<number, DatabaseError>;
  readonly countActiveDownloads: () => Effect.Effect<number, DatabaseError>;
  readonly listActiveDownloadRows: (
    limit?: number,
  ) => Effect.Effect<readonly DownloadRow[], DatabaseError>;
  readonly listDownloadEvents: (
    input?: DownloadEventListQuery,
  ) => Effect.Effect<DownloadEventsPage, DatabaseError | StoredDataError>;
  readonly listDownloadHistory: (input?: {
    readonly cursor?: string;
    readonly limit?: number;
  }) => Effect.Effect<DownloadHistoryPage, DatabaseError | StoredDataError>;
  readonly listDownloadsByInfoHashes: (
    infoHashes: readonly string[],
  ) => Effect.Effect<readonly DownloadRow[], DatabaseError>;
  readonly listDownloadsByMediaId: (
    mediaId: number,
  ) => Effect.Effect<readonly DownloadRow[], DatabaseError>;
  readonly listRecentDownloadEventRows: (
    limit: number,
  ) => Effect.Effect<readonly (typeof downloadEvents.$inferSelect)[], DatabaseError>;
  readonly loadDownloadById: (id: number) => Effect.Effect<DownloadRow | undefined, DatabaseError>;
  readonly loadDownloadByInfoHash: (
    infoHash: string,
  ) => Effect.Effect<DownloadRow | undefined, DatabaseError>;
  readonly loadDownloadEventExportHeader: (
    input: DownloadEventExportQuery | undefined,
    generatedAt: string,
  ) => Effect.Effect<DownloadEventExportHeader, DatabaseError>;
  readonly loadDownloadStatusStats: () => Effect.Effect<DownloadStatusStats, DatabaseError>;
  readonly loadEventPresentationContexts: (
    rows: readonly DownloadEventRowLike[],
  ) => Effect.Effect<
    Map<number, DownloadEventPresentationContext>,
    DatabaseError | StoredDataError
  >;
  readonly loadPresentationContexts: (
    rows: readonly DownloadRow[],
  ) => Effect.Effect<Map<number, DownloadPresentationContext>, DatabaseError | StoredDataError>;
  readonly streamDownloadEvents: (
    input?: DownloadEventExportQuery,
  ) => Stream.Stream<DownloadEvent, DatabaseError | StoredDataError>;
  readonly lookupDownloadByInfoHash: (
    infoHash: string,
  ) => Effect.Effect<{ id: number; status: string } | undefined, DatabaseError>;
  readonly markDownloadReconciled: (input: {
    readonly claimToken?: string;
    readonly downloadId: number;
    readonly now: string;
  }) => Effect.Effect<void, DatabaseError>;
  /**
   * Compensating release for `claimDownloadReconciliation`: resets
   * `reconciledAt` to NULL only when it still equals the token, so a finalize
   * that already overwrote the token with a timestamp is left untouched.
   */
  readonly releaseDownloadReconciliationClaim: (input: {
    readonly claimToken: string;
    readonly downloadId: number;
  }) => Effect.Effect<void, DatabaseError>;
  readonly updateDownloadCoveredUnits: (input: {
    readonly coveredUnits: string | null;
    readonly downloadId: number;
    readonly isBatch: boolean;
    readonly unitNumber: number;
  }) => Effect.Effect<void, DatabaseError>;
  readonly updateDownloadRetryRow: (input: {
    readonly id: number;
    readonly externalState: string;
    readonly retryNow: string;
    readonly status: string;
  }) => Effect.Effect<void, DatabaseError>;
  readonly updateDownloadStatusRow: (input: {
    readonly id: number;
    readonly externalState: string;
    readonly status: string;
  }) => Effect.Effect<void, DatabaseError>;
}

export class DownloadRepository extends Context.Service<
  DownloadRepository,
  DownloadRepositoryShape
>()("@bakarr/api/DownloadRepository") {
  static readonly layer = Layer.effect(
    DownloadRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeDownloadRepositoryShape(db, sqlClient);
    }),
  );
}

export function makeDownloadRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): DownloadRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    bulkUpdateTorrentSyncRows: (chunk, events, createdAt) =>
      bulkUpdateTorrentSyncRows(db, exec, chunk, events, createdAt),
    claimDownloadReconciliation: (downloadId, claimToken) =>
      claimDownloadReconciliation(db, exec, downloadId, claimToken),
    deleteDownloadRow: (id) => deleteDownloadRow(db, exec, id, "Failed to remove download"),
    deleteDownloadWithEventTx: (input) => deleteDownloadWithEventTx(db, exec, input),
    failStaleQueuedDownloads: (input) => failStaleQueuedDownloads(db, exec, input),
    finalizeDownloadImport: (input) => finalizeDownloadImport(db, exec, input),
    finalizeQueuedDownloadTx: (input) => finalizeQueuedDownloadTx(db, exec, input),
    insertDownloadEvent: (input, createdAt) => insertDownloadEventRow(db, exec, input, createdAt),
    updateDownloadStatusWithEventTx: (input) => updateDownloadStatusWithEventTx(db, exec, input),
    insertQueuedDownloadRow: (input) => insertQueuedDownloadRow(db, exec, input),
    countActiveDownloads: () => countActiveDownloads(db, exec),
    listActiveDownloadRows: (limit) => listActiveDownloadRows(db, exec, limit),
    listDownloadEvents: (input) => listDownloadEventsPage(db, exec, input),
    listDownloadHistory: (input) => listDownloadHistoryPage(db, exec, input),
    listDownloadsByInfoHashes: (infoHashes) => listDownloadsByInfoHashes(db, exec, infoHashes),
    listDownloadsByMediaId: (mediaId) => listDownloadsByMediaId(db, exec, mediaId),
    listRecentDownloadEventRows: (limit) => listRecentDownloadEventRowsPage(db, exec, limit),
    loadDownloadById: (id) => loadDownloadById(db, exec, id),
    loadDownloadByInfoHash: (infoHash) => loadDownloadByInfoHash(db, exec, infoHash),
    loadDownloadEventExportHeader: (input, generatedAt) =>
      loadDownloadEventExportHeaderPage(db, exec, input, generatedAt),
    loadDownloadStatusStats: () => loadDownloadStatusStatsPage(db, exec),
    loadEventPresentationContexts: (rows) => loadDownloadEventPresentationContexts(db, exec, rows),
    loadPresentationContexts: (rows) => loadPresentationContexts(db, exec, rows),
    streamDownloadEvents: (input) => streamDownloadEventsPage(db, exec, input),
    lookupDownloadByInfoHash: (infoHash) => lookupDownloadByInfoHash(db, exec, infoHash),
    markDownloadReconciled: (input) => markDownloadReconciled(db, exec, input),
    releaseDownloadReconciliationClaim: (input) =>
      releaseDownloadReconciliationClaim(db, exec, input),
    updateDownloadCoveredUnits: (input) => updateDownloadCoveredUnits(db, exec, input),
    updateDownloadRetryRow: (input) => updateDownloadRetryRow(db, exec, input),
    updateDownloadStatusRow: (input) =>
      updateDownloadStatusRow(
        db,
        exec,
        input,
        `Failed to update download status to ${input.status}`,
      ),
  } satisfies DownloadRepositoryShape;
}

/**
 * Chunked sync write: status updates and their status-change events commit in
 * one transaction per chunk, so a synced row never observes a status without
 * its event (same guarantee as `finalizeQueuedDownloadTx`).
 */
const bulkUpdateTorrentSyncRows = Effect.fn("DownloadRepository.bulkUpdateTorrentSyncRows")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    chunk: readonly TorrentSyncUpdate[],
    events: readonly DownloadEventRecordInput[],
    createdAt: string,
  ) {
    const eventRows = yield* Effect.forEach(events, (event) =>
      toDownloadEventInsert(event, createdAt),
    );

    yield* exec.runTransaction(
      "Failed to sync downloads with qBittorrent",
      Effect.gen(function* () {
        yield* db
          .update(downloads)
          .set({
            contentPath: buildTorrentSyncCase(
              chunk,
              (row) => row.contentPath,
              sql`${downloads.contentPath}`,
            ),
            downloadDate: buildTorrentSyncCase(
              chunk,
              (row) => row.downloadDate,
              sql`${downloads.downloadDate}`,
            ),
            downloadedBytes: buildTorrentSyncCase(
              chunk,
              (row) => row.downloadedBytes,
              sql`${downloads.downloadedBytes}`,
            ),
            errorMessage: buildTorrentSyncCase(
              chunk,
              (row) => row.errorMessage,
              sql`${downloads.errorMessage}`,
            ),
            etaSeconds: buildTorrentSyncCase(
              chunk,
              (row) => row.etaSeconds,
              sql`${downloads.etaSeconds}`,
            ),
            externalState: buildTorrentSyncCase(
              chunk,
              (row) => row.externalState,
              sql`${downloads.externalState}`,
            ),
            lastErrorAt: buildTorrentSyncCase(
              chunk,
              (row) => row.lastErrorAt,
              sql`${downloads.lastErrorAt}`,
            ),
            lastSyncedAt: buildTorrentSyncCase(
              chunk,
              (row) => row.lastSyncedAt,
              sql`${downloads.lastSyncedAt}`,
            ),
            progress: buildTorrentSyncCase(
              chunk,
              (row) => row.progress,
              sql`${downloads.progress}`,
            ),
            savePath: buildTorrentSyncCase(
              chunk,
              (row) => row.savePath,
              sql`${downloads.savePath}`,
            ),
            speedBytes: buildTorrentSyncCase(
              chunk,
              (row) => row.speedBytes,
              sql`${downloads.speedBytes}`,
            ),
            status: buildTorrentSyncCase(chunk, (row) => row.nextStatus, sql`${downloads.status}`),
            totalBytes: buildTorrentSyncCase(
              chunk,
              (row) => row.totalBytes,
              sql`${downloads.totalBytes}`,
            ),
          })
          .where(
            inArray(
              downloads.infoHash,
              chunk.map((row) => row.hash),
            ),
          )
          .prepare()
          .effect();
        if (eventRows.length > 0) {
          yield* db.insert(downloadEvents).values(eventRows).prepare().effect();
        }
      }),
    );
  },
);

const finalizeDownloadImport = Effect.fn("DownloadRepository.finalizeDownloadImport")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly claimToken: string;
    readonly downloadId: number;
    readonly fromStatus: string;
    readonly now: string;
    readonly mediaId: number;
    readonly eventType: string;
    readonly eventMessage: string;
    readonly eventMetadata: string | null;
    readonly logEventType: string;
    readonly logMessage: string;
  },
) {
  yield* exec.runTransaction(
    "Failed to reconcile completed download",
    Effect.gen(function* () {
      const updated = yield* db
        .update(downloads)
        .set({
          externalState: "imported",
          progress: 100,
          status: "imported",
          reconciledAt: input.now,
        })
        .where(
          and(eq(downloads.id, input.downloadId), eq(downloads.reconciledAt, input.claimToken)),
        )
        .returning({ id: downloads.id })
        .prepare()
        .effect();
      if (updated.length === 0) {
        return yield* new DatabaseError({
          cause: new Error(
            `Download ${input.downloadId} finalize failed: claim token mismatch or already finalized`,
          ),
          message: "Failed to reconcile completed download",
        });
      }
      yield* db
        .insert(downloadEvents)
        .values({
          mediaId: input.mediaId,
          createdAt: input.now,
          downloadId: input.downloadId,
          eventType: input.eventType,
          fromStatus: input.fromStatus,
          message: input.eventMessage,
          metadata: input.eventMetadata,
          toStatus: "imported",
        })
        .prepare()
        .effect();
      yield* db
        .insert(systemLogs)
        .values({
          createdAt: input.now,
          details: null,
          eventType: input.logEventType,
          level: "success",
          message: input.logMessage,
        })
        .prepare()
        .effect();
    }),
  );
});

const finalizeQueuedDownloadTx = Effect.fn("DownloadRepository.finalizeQueuedDownloadTx")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    input: {
      readonly downloadId: number;
      readonly eventType: string;
      readonly eventMessage: string;
      readonly eventMetadata: string | null;
      readonly eventMetadataJson: {
        readonly covered_units?: readonly number[];
        readonly source_metadata?: DownloadSourceMetadata;
      };
      readonly externalState: string;
      readonly mediaId: number;
      readonly now: string;
      readonly status: string;
    },
  ) {
    const eventRow = yield* toDownloadEventInsert(
      {
        mediaId: input.mediaId,
        downloadId: input.downloadId,
        eventType: input.eventType,
        message: input.eventMessage,
        metadata: input.eventMetadata,
        metadataJson: input.eventMetadataJson,
        toStatus: input.status,
      },
      input.now,
    );

    yield* exec.runTransaction(
      "Failed to finalize queued download",
      Effect.gen(function* () {
        yield* db
          .update(downloads)
          .set({ externalState: input.externalState, status: input.status })
          .where(eq(downloads.id, input.downloadId))
          .prepare()
          .effect();
        yield* db.insert(downloadEvents).values(eventRow).prepare().effect();
      }),
    );
  },
);

const updateDownloadStatusWithEventTx = Effect.fn(
  "DownloadRepository.updateDownloadStatusWithEventTx",
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly createdAt: string;
    readonly downloadId: number;
    readonly eventType: string;
    readonly eventMessage: string;
    readonly eventMetadataJson: {
      readonly covered_units?: readonly number[];
      readonly source_metadata?: DownloadSourceMetadata;
    };
    readonly externalState: string;
    readonly fromStatus: string;
    readonly mediaId: number;
    readonly status: string;
    readonly toStatus: string;
  },
) {
  const eventRow = yield* toDownloadEventInsert(
    {
      mediaId: input.mediaId,
      downloadId: input.downloadId,
      eventType: input.eventType,
      fromStatus: input.fromStatus,
      message: input.eventMessage,
      metadataJson: input.eventMetadataJson,
      toStatus: input.toStatus,
    },
    input.createdAt,
  );

  yield* exec.runTransaction(
    "Failed to update download status",
    Effect.gen(function* () {
      yield* db
        .update(downloads)
        .set({ externalState: input.externalState, status: input.status })
        .where(eq(downloads.id, input.downloadId))
        .prepare()
        .effect();
      yield* db.insert(downloadEvents).values(eventRow).prepare().effect();
    }),
  );
});

const deleteDownloadWithEventTx = Effect.fn("DownloadRepository.deleteDownloadWithEventTx")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    input: {
      readonly createdAt: string;
      readonly downloadId: number;
      readonly event: DownloadEventRecordInput;
    },
  ) {
    const eventRow = yield* toDownloadEventInsert(input.event, input.createdAt);

    yield* exec.runTransaction(
      "Failed to remove download",
      Effect.gen(function* () {
        yield* db.insert(downloadEvents).values(eventRow).prepare().effect();
        yield* db.delete(downloads).where(eq(downloads.id, input.downloadId)).prepare().effect();
      }),
    );
  },
);

const failStaleQueuedDownloads = Effect.fn("DownloadRepository.failStaleQueuedDownloads")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    input: { readonly now: string; readonly staleBefore: string },
  ) {
    return yield* exec.runTransaction(
      "Failed to sweep stale queued downloads",
      Effect.gen(function* () {
        const staleRows = yield* db
          .select({
            id: downloads.id,
            mediaId: downloads.mediaId,
            torrentName: downloads.torrentName,
          })
          .from(downloads)
          .where(and(eq(downloads.status, "queued"), lt(downloads.lastSyncedAt, input.staleBefore)))
          .prepare()
          .effect();

        if (staleRows.length === 0) {
          return 0;
        }

        yield* db
          .update(downloads)
          .set({
            errorMessage: "qBittorrent no longer reports this queued download",
            externalState: "failed",
            status: "failed",
          })
          .where(
            inArray(
              downloads.id,
              staleRows.map((row) => row.id),
            ),
          )
          .prepare()
          .effect();
        yield* db
          .insert(downloadEvents)
          .values(
            staleRows.map((row) => ({
              mediaId: row.mediaId,
              createdAt: input.now,
              downloadId: row.id,
              eventType: "download.failed",
              fromStatus: "queued",
              message: `Lost track of queued download ${row.torrentName}`,
              metadata: null,
              toStatus: "failed",
            })),
          )
          .prepare()
          .effect();

        return staleRows.length;
      }),
    );
  },
);

const insertQueuedDownloadRow = Effect.fn("DownloadRepository.insertQueuedDownloadRow")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly addedAt: string;
    readonly coveredUnits: string | null;
    readonly groupName: string | null;
    readonly infoHash: string | null;
    readonly isBatch: boolean;
    readonly lastSyncedAt: string;
    readonly magnet: string;
    readonly mediaId: number;
    readonly mediaTitle: string;
    readonly sourceMetadata: string;
    readonly torrentName: string;
    readonly totalBytes?: number | null;
    readonly unitNumber: number;
  },
) {
  const rows = yield* exec.runQuery(
    "Failed to trigger download",
    db
      .insert(downloads)
      .values({
        addedAt: input.addedAt,
        mediaId: input.mediaId,
        mediaTitle: input.mediaTitle,
        contentPath: null,
        coveredUnits: input.coveredUnits,
        downloadDate: null,
        unitNumber: input.unitNumber,
        isBatch: input.isBatch,
        downloadedBytes: 0,
        errorMessage: null,
        etaSeconds: null,
        externalState: "queued",
        groupName: input.groupName,
        infoHash: input.infoHash,
        lastSyncedAt: input.lastSyncedAt,
        magnet: input.magnet,
        progress: 0,
        savePath: null,
        sourceMetadata: input.sourceMetadata,
        speedBytes: 0,
        status: "queued",
        torrentName: input.torrentName,
        totalBytes: input.totalBytes ?? null,
      })
      .returning({ id: downloads.id })
      .prepare()
      .effect(),
  );

  const created = rows[0];

  if (!created) {
    return yield* new DatabaseError({
      cause: new Error("Download insert returned no rows"),
      message: "Failed to create download",
    });
  }

  return created.id;
});

const listActiveDownloadRows = Effect.fn("DownloadRepository.listActiveDownloadRows")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  limit?: number,
) {
  return yield* (function () {
    const query = db
      .select()
      .from(downloads)
      .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
      .orderBy(desc(downloads.id));
    const __q = limit === undefined ? query : query.limit(limit);
    return exec.runQuery("Failed to load download progress snapshot", __q.prepare().effect());
  })();
});

const countActiveDownloads = Effect.fn("DownloadRepository.countActiveDownloads")(function* (
  db: AppDatabase,
  exec: DbExecutor,
) {
  const countRows = yield* exec.runQuery(
    "Failed to count active downloads",
    db
      .select({ count: sql<number>`count(*)` })
      .from(downloads)
      .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
      .prepare()
      .effect(),
  );
  return countRows[0]?.count ?? 0;
});

const listDownloadsByInfoHashes = Effect.fn("DownloadRepository.listDownloadsByInfoHashes")(
  function* (db: AppDatabase, exec: DbExecutor, infoHashes: readonly string[]) {
    return yield* exec.runQuery(
      "Failed to sync downloads with qBittorrent",
      db
        .select()
        .from(downloads)
        .where(inArray(downloads.infoHash, [...infoHashes]))
        .prepare()
        .effect(),
    );
  },
);

const listDownloadsByMediaId = Effect.fn("DownloadRepository.listDownloadsByMediaId")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  return yield* exec.runQuery(
    "Failed to check overlapping download",
    db.select().from(downloads).where(eq(downloads.mediaId, mediaId)).prepare().effect(),
  );
});

const loadDownloadById = Effect.fn("DownloadRepository.loadDownloadById")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  id: number,
) {
  const rows = yield* exec.runQuery(
    "Failed to load download",
    db.select().from(downloads).where(eq(downloads.id, id)).limit(1).prepare().effect(),
  );
  return rows[0];
});

const loadDownloadByInfoHash = Effect.fn("DownloadRepository.loadDownloadByInfoHash")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  infoHash: string,
) {
  // Migration 0031 allows several rows per info_hash (terminal + in-flight).
  // Reconcile targets the current attempt: not yet reconciled, newest insert.
  const rows = yield* exec.runQuery(
    "Failed to reconcile completed download",
    db
      .select()
      .from(downloads)
      .where(and(eq(downloads.infoHash, infoHash), isNull(downloads.reconciledAt)))
      .orderBy(desc(downloads.id))
      .limit(1)
      .prepare()
      .effect(),
  );
  return rows[0];
});

const loadPresentationContexts = Effect.fn("DownloadRepository.loadPresentationContexts")(
  function* (db: AppDatabase, exec: DbExecutor, rows: readonly DownloadRow[]) {
    return yield* loadDownloadPresentationContexts(db, exec, rows);
  },
);

const lookupDownloadByInfoHash = Effect.fn("DownloadRepository.lookupDownloadByInfoHash")(
  function* (db: AppDatabase, exec: DbExecutor, infoHash: string) {
    // Only in-flight rows block re-queueing; terminal rows must not (the
    // partial unique index from migration 0031 enforces this in SQL).
    const rows = yield* exec.runQuery(
      "Failed to check overlapping download",
      db
        .select({
          id: downloads.id,
          status: downloads.status,
        })
        .from(downloads)
        .where(
          and(
            eq(downloads.infoHash, infoHash),
            inArray(downloads.status, ["queued", "downloading", "paused"]),
          ),
        )
        .limit(1)
        .prepare()
        .effect(),
    );
    return rows[0];
  },
);

const markDownloadReconciled = Effect.fn("DownloadRepository.markDownloadReconciled")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: { readonly claimToken?: string; readonly downloadId: number; readonly now: string },
) {
  yield* exec.runTransaction(
    "Failed to reconcile completed download",
    Effect.gen(function* () {
      if (input.claimToken !== undefined) {
        const updated = yield* db
          .update(downloads)
          .set({
            externalState: "imported",
            progress: 100,
            status: "imported",
            reconciledAt: input.now,
          })
          .where(
            and(eq(downloads.id, input.downloadId), eq(downloads.reconciledAt, input.claimToken)),
          )
          .returning({ id: downloads.id })
          .prepare()
          .effect();
        if (updated.length === 0) {
          return yield* new DatabaseError({
            cause: new Error(
              `Download ${input.downloadId} mark reconciled failed: claim token mismatch`,
            ),
            message: "Failed to reconcile completed download",
          });
        }
        return;
      }
      yield* db
        .update(downloads)
        .set({
          externalState: "imported",
          progress: 100,
          status: "imported",
          reconciledAt: input.now,
        })
        .where(eq(downloads.id, input.downloadId))
        .prepare()
        .effect();
    }),
  );
});

const claimDownloadReconciliation = Effect.fn("DownloadRepository.claimDownloadReconciliation")(
  function* (db: AppDatabase, exec: DbExecutor, downloadId: number, claimToken: string) {
    // Claim by id, not info_hash: with migration 0031 several rows can share a
    // hash (terminal + in-flight), and an isNull(reconciledAt) match by hash
    // could claim a stale failed row instead of the row reconcile loaded.
    const claimedRows = yield* exec.runQuery(
      "Failed to claim download reconciliation",
      db
        .update(downloads)
        .set({ reconciledAt: claimToken })
        .where(and(eq(downloads.id, downloadId), isNull(downloads.reconciledAt)))
        .returning({ id: downloads.id })
        .prepare()
        .effect(),
    );
    return claimedRows.length > 0;
  },
);

const releaseDownloadReconciliationClaim = Effect.fn(
  "DownloadRepository.releaseDownloadReconciliationClaim",
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: { readonly claimToken: string; readonly downloadId: number },
) {
  yield* exec.runQuery(
    "Failed to release download reconciliation claim",
    db
      .update(downloads)
      .set({ reconciledAt: null })
      .where(and(eq(downloads.id, input.downloadId), eq(downloads.reconciledAt, input.claimToken)))
      .prepare()
      .effect(),
  );
});

const updateDownloadCoveredUnits = Effect.fn("DownloadRepository.updateDownloadCoveredUnits")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    input: {
      readonly coveredUnits: string | null;
      readonly downloadId: number;
      readonly isBatch: boolean;
      readonly unitNumber: number;
    },
  ) {
    yield* exec.runQuery(
      "Failed to sync downloads with qBittorrent",
      db
        .update(downloads)
        .set({
          coveredUnits: input.coveredUnits,
          unitNumber: input.unitNumber,
          isBatch: input.isBatch,
        })
        .where(eq(downloads.id, input.downloadId))
        .prepare()
        .effect(),
    );
  },
);

const updateDownloadRetryRow = Effect.fn("DownloadRepository.updateDownloadRetryRow")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly id: number;
    readonly externalState: string;
    readonly retryNow: string;
    readonly status: string;
  },
) {
  yield* exec.runQuery(
    "Failed to retry download",
    db
      .update(downloads)
      .set({
        errorMessage: null,
        externalState: input.externalState,
        lastErrorAt: null,
        lastSyncedAt: input.retryNow,
        progress: 0,
        retryCount: sql`${downloads.retryCount} + 1`,
        status: input.status,
      })
      .where(eq(downloads.id, input.id))
      .prepare()
      .effect(),
  );
});
