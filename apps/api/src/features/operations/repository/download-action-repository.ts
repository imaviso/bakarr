import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import { Database, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import {
  deleteDownloadRow,
  insertDownloadEventRow,
  type DownloadEventRecordInput,
  updateDownloadStatusRow,
} from "@/features/operations/repository/download-repository.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

type DownloadRow = typeof downloads.$inferSelect;

export interface DownloadActionRepositoryShape {
  readonly deleteDownloadRow: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly insertDownloadEvent: (
    input: DownloadEventRecordInput,
    createdAt: string,
  ) => Effect.Effect<void, DatabaseError | import("@/features/errors.ts").StoredDataError>;
  readonly loadDownloadRow: (id: number) => Effect.Effect<DownloadRow | undefined, DatabaseError>;
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

export class DownloadActionRepository extends Effect.Service<DownloadActionRepository>()(
  "@bakarr/api/DownloadActionRepository",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* Database;
      return makeDownloadActionRepositoryShape(db);
    }),
  },
) {}

const loadDownloadRow = Effect.fn("DownloadActionRepository.loadDownloadRow")(function* (
  db: AppDatabase,
  id: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load download", () =>
    db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
  );
  return rows[0];
});

const updateDownloadRetryRow = Effect.fn("DownloadActionRepository.updateDownloadRetryRow")(
  function* (
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
  },
);

function makeDownloadActionRepositoryShape(db: AppDatabase): DownloadActionRepositoryShape {
  return {
    deleteDownloadRow: (id) => deleteDownloadRow(db, id, "Failed to remove download"),
    insertDownloadEvent: (input, createdAt) => insertDownloadEventRow(db, input, createdAt),
    loadDownloadRow: (id) => loadDownloadRow(db, id),
    updateDownloadRetryRow: (input) => updateDownloadRetryRow(db, input),
    updateDownloadStatusRow: (input) =>
      updateDownloadStatusRow(db, input, `Failed to update download status to ${input.status}`),
  } satisfies DownloadActionRepositoryShape;
}

export function makeDownloadActionRepository(db: AppDatabase): DownloadActionRepository {
  return DownloadActionRepository.make(makeDownloadActionRepositoryShape(db));
}
