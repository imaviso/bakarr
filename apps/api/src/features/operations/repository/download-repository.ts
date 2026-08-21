// oxlint-disable oxc/no-async-await -- async/await required by transaction callbacks, test callbacks, and tryPromise wrappers
import { and, desc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { Effect, type Stream } from "effect";

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
import { tryDatabasePromise } from "@/infra/effect/db.ts";

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
    infoHash: string,
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

export class DownloadRepository extends Effect.Service<DownloadRepository>()(
  "@bakarr/api/DownloadRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeDownloadRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export function makeDownloadRepositoryShape(db: AppDatabase): DownloadRepositoryShape {
  return {
    bulkUpdateTorrentSyncRows: (chunk, events, createdAt) =>
      bulkUpdateTorrentSyncRows(db, chunk, events, createdAt),
    claimDownloadReconciliation: (infoHash, claimToken) =>
      claimDownloadReconciliation(db, infoHash, claimToken),
    deleteDownloadRow: (id) => deleteDownloadRow(db, id, "Failed to remove download"),
    deleteDownloadWithEventTx: (input) => deleteDownloadWithEventTx(db, input),
    failStaleQueuedDownloads: (input) => failStaleQueuedDownloads(db, input),
    finalizeDownloadImport: (input) => finalizeDownloadImport(db, input),
    finalizeQueuedDownloadTx: (input) => finalizeQueuedDownloadTx(db, input),
    insertDownloadEvent: (input, createdAt) => insertDownloadEventRow(db, input, createdAt),
    updateDownloadStatusWithEventTx: (input) => updateDownloadStatusWithEventTx(db, input),
    insertQueuedDownloadRow: (input) => insertQueuedDownloadRow(db, input),
    countActiveDownloads: () => countActiveDownloads(db),
    listActiveDownloadRows: (limit) => listActiveDownloadRows(db, limit),
    listDownloadEvents: (input) => listDownloadEventsPage(db, input),
    listDownloadHistory: (input) => listDownloadHistoryPage(db, input),
    listDownloadsByInfoHashes: (infoHashes) => listDownloadsByInfoHashes(db, infoHashes),
    listDownloadsByMediaId: (mediaId) => listDownloadsByMediaId(db, mediaId),
    listRecentDownloadEventRows: (limit) => listRecentDownloadEventRowsPage(db, limit),
    loadDownloadById: (id) => loadDownloadById(db, id),
    loadDownloadByInfoHash: (infoHash) => loadDownloadByInfoHash(db, infoHash),
    loadDownloadEventExportHeader: (input, generatedAt) =>
      loadDownloadEventExportHeaderPage(db, input, generatedAt),
    loadDownloadStatusStats: () => loadDownloadStatusStatsPage(db),
    loadEventPresentationContexts: (rows) => loadDownloadEventPresentationContexts(db, rows),
    loadPresentationContexts: (rows) => loadPresentationContexts(db, rows),
    streamDownloadEvents: (input) => streamDownloadEventsPage(db, input),
    lookupDownloadByInfoHash: (infoHash) => lookupDownloadByInfoHash(db, infoHash),
    markDownloadReconciled: (input) => markDownloadReconciled(db, input),
    releaseDownloadReconciliationClaim: (input) => releaseDownloadReconciliationClaim(db, input),
    updateDownloadCoveredUnits: (input) => updateDownloadCoveredUnits(db, input),
    updateDownloadRetryRow: (input) => updateDownloadRetryRow(db, input),
    updateDownloadStatusRow: (input) =>
      updateDownloadStatusRow(db, input, `Failed to update download status to ${input.status}`),
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
    chunk: readonly TorrentSyncUpdate[],
    events: readonly DownloadEventRecordInput[],
    createdAt: string,
  ) {
    const eventRows = yield* Effect.forEach(events, (event) =>
      toDownloadEventInsert(event, createdAt),
    );

    yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", async () => {
      await db.transaction(async (tx) => {
        await tx
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
          );
        if (eventRows.length > 0) {
          await tx.insert(downloadEvents).values(eventRows);
        }
      });
    });
  },
);

const finalizeDownloadImport = Effect.fn("DownloadRepository.finalizeDownloadImport")(function* (
  db: AppDatabase,
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
  yield* tryDatabasePromise("Failed to reconcile completed download", async () => {
    await db.transaction(async (tx) => {
      const updated = await tx
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
        .returning({ id: downloads.id });
      if (updated.length === 0) {
        throw new Error(
          `Download ${input.downloadId} finalize failed: claim token mismatch or already finalized`,
        );
      }
      await tx.insert(downloadEvents).values({
        mediaId: input.mediaId,
        createdAt: input.now,
        downloadId: input.downloadId,
        eventType: input.eventType,
        fromStatus: input.fromStatus,
        message: input.eventMessage,
        metadata: input.eventMetadata,
        toStatus: "imported",
      });
      await tx.insert(systemLogs).values({
        createdAt: input.now,
        details: null,
        eventType: input.logEventType,
        level: "success",
        message: input.logMessage,
      });
    });
  });
});

const finalizeQueuedDownloadTx = Effect.fn("DownloadRepository.finalizeQueuedDownloadTx")(
  function* (
    db: AppDatabase,
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

    yield* tryDatabasePromise("Failed to finalize queued download", async () => {
      await db.transaction(async (tx) => {
        await tx
          .update(downloads)
          .set({ externalState: input.externalState, status: input.status })
          .where(eq(downloads.id, input.downloadId));
        await tx.insert(downloadEvents).values(eventRow);
      });
    });
  },
);

const updateDownloadStatusWithEventTx = Effect.fn(
  "DownloadRepository.updateDownloadStatusWithEventTx",
)(function* (
  db: AppDatabase,
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

  yield* tryDatabasePromise("Failed to update download status", async () => {
    await db.transaction(async (tx) => {
      await tx
        .update(downloads)
        .set({ externalState: input.externalState, status: input.status })
        .where(eq(downloads.id, input.downloadId));
      await tx.insert(downloadEvents).values(eventRow);
    });
  });
});

const deleteDownloadWithEventTx = Effect.fn("DownloadRepository.deleteDownloadWithEventTx")(
  function* (
    db: AppDatabase,
    input: {
      readonly createdAt: string;
      readonly downloadId: number;
      readonly event: DownloadEventRecordInput;
    },
  ) {
    const eventRow = yield* toDownloadEventInsert(input.event, input.createdAt);

    yield* tryDatabasePromise("Failed to remove download", async () => {
      await db.transaction(async (tx) => {
        await tx.insert(downloadEvents).values(eventRow);
        await tx.delete(downloads).where(eq(downloads.id, input.downloadId));
      });
    });
  },
);

const failStaleQueuedDownloads = Effect.fn("DownloadRepository.failStaleQueuedDownloads")(
  function* (db: AppDatabase, input: { readonly now: string; readonly staleBefore: string }) {
    return yield* tryDatabasePromise("Failed to sweep stale queued downloads", async () => {
      return await db.transaction(async (tx): Promise<number> => {
        const staleRows = await tx
          .select({
            id: downloads.id,
            mediaId: downloads.mediaId,
            torrentName: downloads.torrentName,
          })
          .from(downloads)
          .where(
            and(eq(downloads.status, "queued"), lt(downloads.lastSyncedAt, input.staleBefore)),
          );

        if (staleRows.length === 0) {
          return 0;
        }

        await tx
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
          );
        await tx.insert(downloadEvents).values(
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
        );

        return staleRows.length;
      });
    });
  },
);

const insertQueuedDownloadRow = Effect.fn("DownloadRepository.insertQueuedDownloadRow")(function* (
  db: AppDatabase,
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
  const rows = yield* tryDatabasePromise("Failed to trigger download", () =>
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
      .returning({ id: downloads.id }),
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
  limit?: number,
) {
  return yield* tryDatabasePromise("Failed to load download progress snapshot", () => {
    const query = db
      .select()
      .from(downloads)
      .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
      .orderBy(desc(downloads.id));
    return limit === undefined ? query : query.limit(limit);
  });
});

const countActiveDownloads = Effect.fn("DownloadRepository.countActiveDownloads")(function* (
  db: AppDatabase,
) {
  const countRows = yield* tryDatabasePromise("Failed to count active downloads", () =>
    db
      .select({ count: sql<number>`count(*)` })
      .from(downloads)
      .where(inArray(downloads.status, ["queued", "downloading", "paused"])),
  );
  return countRows[0]?.count ?? 0;
});

const listDownloadsByInfoHashes = Effect.fn("DownloadRepository.listDownloadsByInfoHashes")(
  function* (db: AppDatabase, infoHashes: readonly string[]) {
    return yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
      db
        .select()
        .from(downloads)
        .where(inArray(downloads.infoHash, [...infoHashes])),
    );
  },
);

const listDownloadsByMediaId = Effect.fn("DownloadRepository.listDownloadsByMediaId")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  return yield* tryDatabasePromise("Failed to check overlapping download", () =>
    db.select().from(downloads).where(eq(downloads.mediaId, mediaId)),
  );
});

const loadDownloadById = Effect.fn("DownloadRepository.loadDownloadById")(function* (
  db: AppDatabase,
  id: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load download", () =>
    db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
  );
  return rows[0];
});

const loadDownloadByInfoHash = Effect.fn("DownloadRepository.loadDownloadByInfoHash")(function* (
  db: AppDatabase,
  infoHash: string,
) {
  const rows = yield* tryDatabasePromise("Failed to reconcile completed download", () =>
    db.select().from(downloads).where(eq(downloads.infoHash, infoHash)).limit(1),
  );
  return rows[0];
});

const loadPresentationContexts = Effect.fn("DownloadRepository.loadPresentationContexts")(
  function* (db: AppDatabase, rows: readonly DownloadRow[]) {
    return yield* loadDownloadPresentationContexts(db, rows);
  },
);

const lookupDownloadByInfoHash = Effect.fn("DownloadRepository.lookupDownloadByInfoHash")(
  function* (db: AppDatabase, infoHash: string) {
    const rows = yield* tryDatabasePromise("Failed to check overlapping download", () =>
      db
        .select({
          id: downloads.id,
          status: downloads.status,
        })
        .from(downloads)
        .where(eq(downloads.infoHash, infoHash))
        .limit(1),
    );
    return rows[0];
  },
);

const markDownloadReconciled = Effect.fn("DownloadRepository.markDownloadReconciled")(function* (
  db: AppDatabase,
  input: { readonly claimToken?: string; readonly downloadId: number; readonly now: string },
) {
  yield* tryDatabasePromise("Failed to reconcile completed download", async () => {
    await db.transaction(async (tx) => {
      if (input.claimToken !== undefined) {
        const updated = await tx
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
          .returning({ id: downloads.id });
        if (updated.length === 0) {
          throw new Error(
            `Download ${input.downloadId} mark reconciled failed: claim token mismatch`,
          );
        }
        return;
      }
      await tx
        .update(downloads)
        .set({
          externalState: "imported",
          progress: 100,
          status: "imported",
          reconciledAt: input.now,
        })
        .where(eq(downloads.id, input.downloadId));
    });
  });
});

const claimDownloadReconciliation = Effect.fn("DownloadRepository.claimDownloadReconciliation")(
  function* (db: AppDatabase, infoHash: string, claimToken: string) {
    const claimedRows = yield* tryDatabasePromise("Failed to claim download reconciliation", () =>
      db
        .update(downloads)
        .set({ reconciledAt: claimToken })
        .where(and(eq(downloads.infoHash, infoHash), isNull(downloads.reconciledAt)))
        .returning({ id: downloads.id }),
    );
    return claimedRows.length > 0;
  },
);

const releaseDownloadReconciliationClaim = Effect.fn(
  "DownloadRepository.releaseDownloadReconciliationClaim",
)(function* (db: AppDatabase, input: { readonly claimToken: string; readonly downloadId: number }) {
  yield* tryDatabasePromise("Failed to release download reconciliation claim", () =>
    db
      .update(downloads)
      .set({ reconciledAt: null })
      .where(and(eq(downloads.id, input.downloadId), eq(downloads.reconciledAt, input.claimToken))),
  );
});

const updateDownloadCoveredUnits = Effect.fn("DownloadRepository.updateDownloadCoveredUnits")(
  function* (
    db: AppDatabase,
    input: {
      readonly coveredUnits: string | null;
      readonly downloadId: number;
      readonly isBatch: boolean;
      readonly unitNumber: number;
    },
  ) {
    yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
      db
        .update(downloads)
        .set({
          coveredUnits: input.coveredUnits,
          unitNumber: input.unitNumber,
          isBatch: input.isBatch,
        })
        .where(eq(downloads.id, input.downloadId)),
    );
  },
);

const updateDownloadRetryRow = Effect.fn("DownloadRepository.updateDownloadRetryRow")(function* (
  db: AppDatabase,
  input: {
    readonly id: number;
    readonly externalState: string;
    readonly retryNow: string;
    readonly status: string;
  },
) {
  yield* tryDatabasePromise("Failed to retry download", () =>
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
      .where(eq(downloads.id, input.id)),
  );
});
