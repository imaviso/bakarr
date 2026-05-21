import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import { Database, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { downloads, mediaUnits, systemLogs } from "@/db/schema.ts";
import {
  deleteDownloadRow,
  insertDownloadEventRow,
  type DownloadEventRecordInput,
  updateDownloadStatusRow,
} from "@/features/operations/repository/download-repository.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

type DownloadRow = typeof downloads.$inferSelect;

export interface DownloadTriggerRepositoryShape {
  readonly appendLogRow: (input: {
    readonly createdAt: string;
    readonly eventType: string;
    readonly level: string;
    readonly message: string;
  }) => Effect.Effect<void, DatabaseError>;
  readonly deleteDownloadRow: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly insertDownloadEvent: (
    input: DownloadEventRecordInput,
    createdAt: string,
  ) => Effect.Effect<
    void,
    DatabaseError | import("@/features/operations/errors.ts").OperationsStoredDataError
  >;
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
  readonly listDownloadsByMediaId: (
    mediaId: number,
  ) => Effect.Effect<readonly DownloadRow[], DatabaseError>;
  readonly listMissingEpisodeNumbers: (
    mediaId: number,
  ) => Effect.Effect<readonly number[], DatabaseError>;
  readonly lookupDownloadByInfoHash: (
    infoHash: string,
  ) => Effect.Effect<{ id: number; status: string } | undefined, DatabaseError>;
  readonly updateDownloadStatusRow: (input: {
    readonly externalState: string;
    readonly id: number;
    readonly status: string;
  }) => Effect.Effect<void, DatabaseError>;
}

export class DownloadTriggerRepository extends Effect.Service<DownloadTriggerRepository>()(
  "@bakarr/api/DownloadTriggerRepository",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* Database;
      return makeDownloadTriggerRepositoryShape(db);
    }),
  },
) {}

const appendLogRow = Effect.fn("DownloadTriggerRepository.appendLogRow")(function* (
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

const insertQueuedDownloadRow = Effect.fn("DownloadTriggerRepository.insertQueuedDownloadRow")(
  function* (
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
  },
);

const listDownloadsByMediaId = Effect.fn("DownloadTriggerRepository.listDownloadsByMediaId")(
  function* (db: AppDatabase, mediaId: number) {
    return yield* tryDatabasePromise("Failed to check overlapping download", () =>
      db.select().from(downloads).where(eq(downloads.mediaId, mediaId)),
    );
  },
);

const listMissingEpisodeNumbers = Effect.fn("DownloadTriggerRepository.listMissingEpisodeNumbers")(
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

const lookupDownloadByInfoHash = Effect.fn("DownloadTriggerRepository.lookupDownloadByInfoHash")(
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

function makeDownloadTriggerRepositoryShape(db: AppDatabase): DownloadTriggerRepositoryShape {
  return {
    appendLogRow: (input) => appendLogRow(db, input),
    deleteDownloadRow: (id) => deleteDownloadRow(db, id, "Cleanup failed download"),
    insertDownloadEvent: (input, createdAt) => insertDownloadEventRow(db, input, createdAt),
    insertQueuedDownloadRow: (input) => insertQueuedDownloadRow(db, input),
    listDownloadsByMediaId: (mediaId) => listDownloadsByMediaId(db, mediaId),
    listMissingEpisodeNumbers: (mediaId) => listMissingEpisodeNumbers(db, mediaId),
    lookupDownloadByInfoHash: (infoHash) => lookupDownloadByInfoHash(db, infoHash),
    updateDownloadStatusRow: (input) =>
      updateDownloadStatusRow(db, input, "Update download status"),
  } satisfies DownloadTriggerRepositoryShape;
}

export function makeDownloadTriggerRepository(db: AppDatabase): DownloadTriggerRepository {
  return DownloadTriggerRepository.make(makeDownloadTriggerRepositoryShape(db));
}
