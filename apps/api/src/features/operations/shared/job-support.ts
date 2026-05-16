import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { DownloadSourceMetadata } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { downloadEvents, downloads, episodes, systemLogs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  markJobFailed as markJobFailedBase,
  markJobStarted as markJobStartedBase,
  markJobSucceeded as markJobSucceededBase,
  updateJobProgress as updateJobProgressBase,
} from "@/infra/job-status.ts";
import { encodeDownloadEventMetadata } from "@/features/operations/repository/download-repository.ts";

type NowIso = () => Effect.Effect<string>;

export const appendLog = Effect.fn("JobSupport.appendLog")(function* (
  db: AppDatabase,
  eventType: string,
  level: string,
  message: string,
  nowIso: NowIso,
) {
  const now = yield* nowIso();
  yield* tryDatabasePromise("Failed to append log", () =>
    db.insert(systemLogs).values({
      createdAt: now,
      details: null,
      eventType,
      level,
      message,
    }),
  );
});

export const recordDownloadEvent = Effect.fn("JobSupport.recordDownloadEvent")(function* (
  db: AppDatabase,
  input: {
    animeId?: number;
    downloadId?: number;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    message: string;
    metadata?: string | null;
    metadataJson?:
      | {
          covered_episodes?: readonly number[];
          imported_path?: string;
          source_metadata?: DownloadSourceMetadata;
        }
      | undefined;
  },
  nowIso: NowIso,
) {
  const now = yield* nowIso();
  const metadata = input.metadataJson
    ? yield* encodeDownloadEventMetadata(input.metadataJson)
    : (input.metadata ?? null);

  yield* tryDatabasePromise("Failed to record download event", () =>
    db.insert(downloadEvents).values({
      animeId: input.animeId ?? null,
      createdAt: now,
      downloadId: input.downloadId ?? null,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      message: input.message,
      metadata,
      toStatus: input.toStatus ?? null,
    }),
  );
});

export const markDownloadImported = Effect.fn("JobSupport.markDownloadImported")(function* (
  db: AppDatabase,
  downloadId: number,
) {
  yield* tryDatabasePromise("Failed to mark download imported", () =>
    db
      .update(downloads)
      .set({
        externalState: "imported",
        progress: 100,
        status: "imported",
      })
      .where(eq(downloads.id, downloadId)),
  );
});

export const markJobStarted = Effect.fn("JobSupport.markJobStarted")(function* (
  db: AppDatabase,
  name: string,
  nowIso: NowIso,
) {
  yield* markJobStartedBase(db, name, nowIso);
});

export const markJobSucceeded = Effect.fn("JobSupport.markJobSucceeded")(function* (
  db: AppDatabase,
  name: string,
  message: string,
  nowIso: NowIso,
) {
  yield* markJobSucceededBase(db, name, message, nowIso);
});

export const markJobFailed = Effect.fn("JobSupport.markJobFailed")(function* (
  db: AppDatabase,
  name: string,
  cause: unknown,
  nowIso: NowIso,
) {
  yield* markJobFailedBase(db, name, cause, nowIso);
});

export const updateJobProgress = Effect.fn("JobSupport.updateJobProgress")(function* (
  db: AppDatabase,
  name: string,
  progressCurrent: number,
  progressTotal: number,
  nowIso: NowIso,
  message?: string,
) {
  yield* updateJobProgressBase(db, name, progressCurrent, progressTotal, nowIso, message);
});

export const loadMissingEpisodeNumbers = Effect.fn("JobSupport.loadMissingEpisodeNumbers")(
  function* (db: AppDatabase, animeId: number) {
    const rows = yield* tryDatabasePromise("Failed to load missing unit numbers", () =>
      db
        .select()
        .from(episodes)
        .where(and(eq(episodes.animeId, animeId), eq(episodes.downloaded, false))),
    );
    return rows.map((row) => row.number).toSorted((left, right) => left - right);
  },
);
