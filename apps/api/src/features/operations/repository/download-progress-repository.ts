import { desc, inArray } from "drizzle-orm";
import { Effect } from "effect";

import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";
import type { DownloadPresentationContext } from "@/features/operations/repository/types.ts";
import { StoredDataError } from "@/features/errors.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

type DownloadRow = typeof downloads.$inferSelect;

export interface DownloadProgressRepositoryShape {
  readonly listActiveDownloadRows: () => Effect.Effect<readonly DownloadRow[], DatabaseError>;
  readonly loadPresentationContexts: (
    rows: readonly DownloadRow[],
  ) => Effect.Effect<Map<number, DownloadPresentationContext>, DatabaseError | StoredDataError>;
}

export class DownloadProgressRepository extends Effect.Service<DownloadProgressRepository>()(
  "@bakarr/api/DownloadProgressRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeDownloadProgressRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export const listActiveDownloadRows = Effect.fn(
  "DownloadProgressRepository.listActiveDownloadRows",
)(function* (db: AppDatabase) {
  return yield* tryDatabasePromise("Failed to load download progress snapshot", () =>
    db
      .select()
      .from(downloads)
      .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
      .orderBy(desc(downloads.id)),
  );
});

export const loadPresentationContexts = Effect.fn(
  "DownloadProgressRepository.loadPresentationContexts",
)(function* (db: AppDatabase, rows: readonly DownloadRow[]) {
  return yield* loadDownloadPresentationContexts(db, rows);
});

function makeDownloadProgressRepositoryShape(db: AppDatabase): DownloadProgressRepositoryShape {
  return {
    listActiveDownloadRows: () => listActiveDownloadRows(db),
    loadPresentationContexts: (rows) => loadPresentationContexts(db, rows),
  } satisfies DownloadProgressRepositoryShape;
}

export function makeDownloadProgressRepository(db: AppDatabase): DownloadProgressRepository {
  return DownloadProgressRepository.make(makeDownloadProgressRepositoryShape(db));
}
