import { eq, inArray, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";

import { Database, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { downloads, media } from "@/db/schema.ts";
import {
  insertDownloadEventRow,
  insertDownloadEventRows,
  type DownloadEventRecordInput,
} from "@/features/operations/repository/download-repository.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

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

export interface DownloadSyncRepositoryShape {
  readonly bulkUpdateTorrentSyncRows: (
    chunk: readonly TorrentSyncUpdate[],
  ) => Effect.Effect<void, DatabaseError>;
  readonly insertDownloadEvent: (
    input: DownloadEventRecordInput,
    createdAt: string,
  ) => Effect.Effect<void, DatabaseError | import("@/features/errors.ts").StoredDataError>;
  readonly insertDownloadEvents: (
    inputs: readonly DownloadEventRecordInput[],
    createdAt: string,
  ) => Effect.Effect<void, DatabaseError | import("@/features/errors.ts").StoredDataError>;
  readonly listDownloadsByInfoHashes: (
    infoHashes: readonly string[],
  ) => Effect.Effect<readonly DownloadRow[], DatabaseError>;
  readonly lookupMediaKind: (
    mediaId: number,
  ) => Effect.Effect<{ mediaKind: string } | undefined, DatabaseError>;
  readonly updateDownloadCoveredUnits: (input: {
    readonly coveredUnits: string | null;
    readonly downloadId: number;
    readonly isBatch: boolean;
    readonly unitNumber: number;
  }) => Effect.Effect<void, DatabaseError>;
}

export class DownloadSyncRepository extends Effect.Service<DownloadSyncRepository>()(
  "@bakarr/api/DownloadSyncRepository",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* Database;
      return makeDownloadSyncRepositoryShape(db);
    }),
  },
) {}

const bulkUpdateTorrentSyncRows = Effect.fn("DownloadSyncRepository.bulkUpdateTorrentSyncRows")(
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

const listDownloadsByInfoHashes = Effect.fn("DownloadSyncRepository.listDownloadsByInfoHashes")(
  function* (db: AppDatabase, infoHashes: readonly string[]) {
    return yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
      db
        .select()
        .from(downloads)
        .where(inArray(downloads.infoHash, [...infoHashes])),
    );
  },
);

const lookupMediaKind = Effect.fn("DownloadSyncRepository.lookupMediaKind")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
    db.select({ mediaKind: media.mediaKind }).from(media).where(eq(media.id, mediaId)).limit(1),
  );
  return rows[0];
});

const updateDownloadCoveredUnits = Effect.fn("DownloadSyncRepository.updateDownloadCoveredUnits")(
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

function makeDownloadSyncRepositoryShape(db: AppDatabase): DownloadSyncRepositoryShape {
  return {
    bulkUpdateTorrentSyncRows: (chunk) => bulkUpdateTorrentSyncRows(db, chunk),
    insertDownloadEvent: (input, createdAt) => insertDownloadEventRow(db, input, createdAt),
    insertDownloadEvents: (inputs, createdAt) => insertDownloadEventRows(db, inputs, createdAt),
    listDownloadsByInfoHashes: (infoHashes) => listDownloadsByInfoHashes(db, infoHashes),
    lookupMediaKind: (mediaId) => lookupMediaKind(db, mediaId),
    updateDownloadCoveredUnits: (input) => updateDownloadCoveredUnits(db, input),
  } satisfies DownloadSyncRepositoryShape;
}

export function makeDownloadSyncRepository(db: AppDatabase): DownloadSyncRepository {
  return DownloadSyncRepository.make(makeDownloadSyncRepositoryShape(db));
}
