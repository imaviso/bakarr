import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { systemLogs } from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";

export const writeAuthLog = Effect.fn("AuthAuditLog.writeLog")(function* (
  db: AppDatabase,
  input: {
    eventType: string;
    level: string;
    message: string;
    details?: string;
  },
  nowIso: () => Effect.Effect<string>,
) {
  const now = yield* nowIso();
  yield* tryDatabasePromise("Failed to write log", () =>
    db.insert(systemLogs).values({
      createdAt: now,
      details: input.details ?? null,
      eventType: input.eventType,
      level: input.level,
      message: input.message,
    }),
  );
});
