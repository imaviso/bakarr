import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { downloadEvents } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  toDownloadEventInsert,
  type DownloadEventRecordInput,
} from "@/features/operations/repository/download-repository.ts";

type NowIso = () => Effect.Effect<string>;

/** @deprecated Prefer DownloadRepository.insertDownloadEvent when service has the Tag. */
export const recordDownloadEvent = Effect.fn("JobSupport.recordDownloadEvent")(function* (
  db: AppDatabase,
  input: DownloadEventRecordInput,
  nowIso: NowIso,
) {
  const now = yield* nowIso();
  const row = yield* toDownloadEventInsert(input, now);

  yield* tryDatabasePromise("Failed to record download event", () =>
    db.insert(downloadEvents).values(row),
  );
});
