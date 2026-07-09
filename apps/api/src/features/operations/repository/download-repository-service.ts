import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";

import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { downloadEvents, downloads, media, mediaUnits, systemLogs } from "@/db/schema.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";
import {
  deleteDownloadRow,
  insertDownloadEventRow,
  insertDownloadEventRows,
  type DownloadEventRecordInput,
  updateDownloadStatusRow,
} from "@/features/operations/repository/download-repository.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { StoredDataError } from "@/features/errors.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

type DownloadRow = typeof downloads.$inferSelect;
type MediaUnitRow = typeof mediaUnits.$inferSelect;
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
  readonly appendLogRow: (input: {
    readonly createdAt: string;
    readonly eventType: string;
    readonly level: string;
    readonly message: string;
  }) => Effect.Effect<void, DatabaseError>;
  readonly bulkUpdateTorrentSyncRows: (
    chunk: readonly TorrentSyncUpdate[],
  ) => Effect.Effect<void, DatabaseError>;
  readonly deleteDownloadRow: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly finalizeDownloadImport: (input: {
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
  readonly insertDownloadEvent: (
    input: DownloadEventRecordInput,
    createdAt: string,
  ) => Effect.Effect<void, DatabaseError | StoredDataError>;
  readonly insertDownloadEvents: (
    inputs: readonly DownloadEventRecordInput[],
    createdAt: string,
  ) => Effect.Effect<void, DatabaseError | StoredDataError>;
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
    readonly unitNumber: number;
  }) => Effect.Effect<number, DatabaseError>;
  readonly listActiveDownloadRows: () => Effect.Effect<readonly DownloadRow[], DatabaseError>;
  readonly listDownloadsByInfoHashes: (
    infoHashes: readonly string[],
  ) => Effect.Effect<readonly DownloadRow[], DatabaseError>;
  readonly listDownloadsByMediaId: (
    mediaId: number,
  ) => Effect.Effect<readonly DownloadRow[], DatabaseError>;
  readonly listMissingEpisodeNumbers: (
    mediaId: number,
  ) => Effect.Effect<readonly number[], DatabaseError>;
  readonly loadDownloadById: (id: number) => Effect.Effect<DownloadRow | undefined, DatabaseError>;
  readonly loadDownloadByInfoHash: (
    infoHash: string,
  ) => Effect.Effect<DownloadRow | undefined, DatabaseError>;
  readonly loadMediaUnitsByNumbers: (
    mediaId: number,
    numbers: readonly number[],
  ) => Effect.Effect<readonly MediaUnitRow[], DatabaseError>;
  readonly loadPresentationContexts: (
    rows: readonly DownloadRow[],
  ) => Effect.Effect<Map<number, DownloadPresentationContext>, DatabaseError | StoredDataError>;
  readonly lookupDownloadByInfoHash: (
    infoHash: string,
  ) => Effect.Effect<{ id: number; status: string } | undefined, DatabaseError>;
  readonly lookupMediaKind: (
    mediaId: number,
  ) => Effect.Effect<{ mediaKind: string } | undefined, DatabaseError>;
  readonly markDownloadReconciled: (input: {
    readonly downloadId: number;
    readonly now: string;
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

function makeDownloadRepositoryShape(db: AppDatabase): DownloadRepositoryShape {
  return {
    appendLogRow: (input) => appendLogRow(db, input),
    bulkUpdateTorrentSyncRows: (chunk) => bulkUpdateTorrentSyncRows(db, chunk),
    deleteDownloadRow: (id) => deleteDownloadRow(db, id, "Failed to remove download"),
    finalizeDownloadImport: (input) => finalizeDownloadImport(db, input),
    insertDownloadEvent: (input, createdAt) => insertDownloadEventRow(db, input, createdAt),
    insertDownloadEvents: (inputs, createdAt) => insertDownloadEventRows(db, inputs, createdAt),
    insertQueuedDownloadRow: (input) => insertQueuedDownloadRow(db, input),
    listActiveDownloadRows: () => listActiveDownloadRows(db),
    listDownloadsByInfoHashes: (infoHashes) => listDownloadsByInfoHashes(db, infoHashes),
    listDownloadsByMediaId: (mediaId) => listDownloadsByMediaId(db, mediaId),
    listMissingEpisodeNumbers: (mediaId) => listMissingEpisodeNumbers(db, mediaId),
    loadDownloadById: (id) => loadDownloadById(db, id),
    loadDownloadByInfoHash: (infoHash) => loadDownloadByInfoHash(db, infoHash),
    loadMediaUnitsByNumbers: (mediaId, numbers) => loadMediaUnitsByNumbers(db, mediaId, numbers),
    loadPresentationContexts: (rows) => loadPresentationContexts(db, rows),
    lookupDownloadByInfoHash: (infoHash) => lookupDownloadByInfoHash(db, infoHash),
    lookupMediaKind: (mediaId) => lookupMediaKind(db, mediaId),
    markDownloadReconciled: (input) => markDownloadReconciled(db, input),
    updateDownloadCoveredUnits: (input) => updateDownloadCoveredUnits(db, input),
    updateDownloadRetryRow: (input) => updateDownloadRetryRow(db, input),
    updateDownloadStatusRow: (input) =>
      updateDownloadStatusRow(db, input, `Failed to update download status to ${input.status}`),
  } satisfies DownloadRepositoryShape;
}

export function makeDownloadRepository(db: AppDatabase): DownloadRepository {
  return DownloadRepository.make(makeDownloadRepositoryShape(db));
}

const appendLogRow = Effect.fn("DownloadRepository.appendLogRow")(function* (
  db: AppDatabase,
  input: {
    readonly createdAt: string;
    readonly eventType: string;
    readonly level: string;
    readonly message: string;
  },
) {
  yield* tryDatabasePromise("Failed to append log", () =>
    db.insert(systemLogs).values({
      createdAt: input.createdAt,
      details: null,
      eventType: input.eventType,
      level: input.level,
      message: input.message,
    }),
  );
});

const bulkUpdateTorrentSyncRows = Effect.fn("DownloadRepository.bulkUpdateTorrentSyncRows")(
  function* (db: AppDatabase, chunk: readonly TorrentSyncUpdate[]) {
    yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
      db
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
          progress: buildTorrentSyncCase(chunk, (row) => row.progress, sql`${downloads.progress}`),
          savePath: buildTorrentSyncCase(chunk, (row) => row.savePath, sql`${downloads.savePath}`),
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
        ),
    );
  },
);

const finalizeDownloadImport = Effect.fn("DownloadRepository.finalizeDownloadImport")(function* (
  db: AppDatabase,
  input: {
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
      await tx
        .update(downloads)
        .set({ externalState: "imported", progress: 100, status: "imported" })
        .where(eq(downloads.id, input.downloadId));
      await tx
        .update(downloads)
        .set({ reconciledAt: input.now })
        .where(eq(downloads.id, input.downloadId));
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
        totalBytes: null,
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
) {
  return yield* tryDatabasePromise("Failed to load download progress snapshot", () =>
    db
      .select()
      .from(downloads)
      .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
      .orderBy(desc(downloads.id)),
  );
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

const listMissingEpisodeNumbers = Effect.fn("DownloadRepository.listMissingEpisodeNumbers")(
  function* (db: AppDatabase, mediaId: number) {
    const rows = yield* tryDatabasePromise("Failed to load missing unit numbers", () =>
      db
        .select()
        .from(mediaUnits)
        .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.downloaded, false))),
    );
    return rows.map((row) => row.number).toSorted((left, right) => left - right);
  },
);

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

const loadMediaUnitsByNumbers = Effect.fn("DownloadRepository.loadMediaUnitsByNumbers")(function* (
  db: AppDatabase,
  mediaId: number,
  numbers: readonly number[],
) {
  if (numbers.length === 0) {
    return [] as readonly MediaUnitRow[];
  }

  return yield* tryDatabasePromise("Failed to reconcile completed download", () =>
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), inArray(mediaUnits.number, [...numbers]))),
  );
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

const lookupMediaKind = Effect.fn("DownloadRepository.lookupMediaKind")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
    db.select({ mediaKind: media.mediaKind }).from(media).where(eq(media.id, mediaId)).limit(1),
  );
  return rows[0];
});

const markDownloadReconciled = Effect.fn("DownloadRepository.markDownloadReconciled")(function* (
  db: AppDatabase,
  input: { readonly downloadId: number; readonly now: string },
) {
  yield* tryDatabasePromise("Failed to reconcile completed download", async () => {
    await db.transaction(async (tx) => {
      await tx
        .update(downloads)
        .set({ externalState: "imported", progress: 100, status: "imported" })
        .where(eq(downloads.id, input.downloadId));
      await tx
        .update(downloads)
        .set({ reconciledAt: input.now })
        .where(eq(downloads.id, input.downloadId));
    });
  });
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

