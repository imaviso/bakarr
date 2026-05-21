import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

import { Database, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { downloadEvents, downloads, mediaUnits, systemLogs } from "@/db/schema.ts";
import { upsertEpisodeFilesAtomic } from "@/features/operations/download/download-unit-upsert-support.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

type DownloadRow = typeof downloads.$inferSelect;
type MediaUnitRow = typeof mediaUnits.$inferSelect;

export interface DownloadReconciliationRepositoryShape {
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
  readonly loadDownloadById: (id: number) => Effect.Effect<DownloadRow | undefined, DatabaseError>;
  readonly loadDownloadByInfoHash: (
    infoHash: string,
  ) => Effect.Effect<DownloadRow | undefined, DatabaseError>;
  readonly loadMediaUnitsByNumbers: (
    mediaId: number,
    numbers: readonly number[],
  ) => Effect.Effect<readonly MediaUnitRow[], DatabaseError>;
  readonly markDownloadReconciled: (input: {
    readonly downloadId: number;
    readonly now: string;
  }) => Effect.Effect<void, DatabaseError>;
  readonly upsertEpisodeFiles: (
    mediaId: number,
    unitNumbers: readonly number[],
    destination: string,
  ) => Effect.Effect<
    void,
    | DatabaseError
    | import("@/features/operations/download/download-unit-upsert-support.ts").UpsertEpisodeFileError
  >;
}

export class DownloadReconciliationRepository extends Effect.Service<DownloadReconciliationRepository>()(
  "@bakarr/api/DownloadReconciliationRepository",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* Database;
      return makeDownloadReconciliationRepositoryShape(db);
    }),
  },
) {}

const finalizeDownloadImport = Effect.fn("DownloadReconciliationRepository.finalizeDownloadImport")(
  function* (
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
  },
);

const loadDownloadById = Effect.fn("DownloadReconciliationRepository.loadDownloadById")(function* (
  db: AppDatabase,
  id: number,
) {
  const rows = yield* tryDatabasePromise("Failed to reconcile download", () =>
    db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
  );
  return rows[0];
});

const loadDownloadByInfoHash = Effect.fn("DownloadReconciliationRepository.loadDownloadByInfoHash")(
  function* (db: AppDatabase, infoHash: string) {
    const rows = yield* tryDatabasePromise("Failed to reconcile completed download", () =>
      db.select().from(downloads).where(eq(downloads.infoHash, infoHash)).limit(1),
    );
    return rows[0];
  },
);

const loadMediaUnitsByNumbers = Effect.fn(
  "DownloadReconciliationRepository.loadMediaUnitsByNumbers",
)(function* (db: AppDatabase, mediaId: number, numbers: readonly number[]) {
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

const markDownloadReconciled = Effect.fn("DownloadReconciliationRepository.markDownloadReconciled")(
  function* (db: AppDatabase, input: { readonly downloadId: number; readonly now: string }) {
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
  },
);

const upsertEpisodeFiles = Effect.fn("DownloadReconciliationRepository.upsertEpisodeFiles")(
  function* (
    db: AppDatabase,
    mediaId: number,
    unitNumbers: readonly number[],
    destination: string,
  ) {
    yield* upsertEpisodeFilesAtomic(db, mediaId, unitNumbers, destination);
  },
);

function makeDownloadReconciliationRepositoryShape(
  db: AppDatabase,
): DownloadReconciliationRepositoryShape {
  return {
    finalizeDownloadImport: (input) => finalizeDownloadImport(db, input),
    loadDownloadById: (id) => loadDownloadById(db, id),
    loadDownloadByInfoHash: (infoHash) => loadDownloadByInfoHash(db, infoHash),
    loadMediaUnitsByNumbers: (mediaId, numbers) => loadMediaUnitsByNumbers(db, mediaId, numbers),
    markDownloadReconciled: (input) => markDownloadReconciled(db, input),
    upsertEpisodeFiles: (mediaId, unitNumbers, destination) =>
      upsertEpisodeFiles(db, mediaId, unitNumbers, destination),
  } satisfies DownloadReconciliationRepositoryShape;
}

export function makeDownloadReconciliationRepository(
  db: AppDatabase,
): DownloadReconciliationRepository {
  return DownloadReconciliationRepository.make(makeDownloadReconciliationRepositoryShape(db));
}
