import type { Config, DownloadSourceMetadata } from "@packages/shared/index.ts";
import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anime, downloadEvents, downloads, systemLogs } from "@/db/schema.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { MediaProbeShape } from "@/infra/media/probe.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { OperationsPathError } from "@/features/operations/errors.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/anime/anime-read-repository.ts";
import { decodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import { resolveAccessibleDownloadPath } from "@/features/operations/download-paths.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export type DownloadRow = typeof downloads.$inferSelect;
export type AnimeRow = typeof anime.$inferSelect;

export type MaybeCleanupImportedTorrent = (
  config: Config | null | undefined,
  infoHash: string | null,
) => Effect.Effect<void>;

export type DownloadReconciliationContext = {
  readonly db: AppDatabase;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly nowIso: () => Effect.Effect<string>;
  readonly randomUuid: () => Effect.Effect<string>;
  readonly maybeCleanupImportedTorrent: MaybeCleanupImportedTorrent;
  readonly eventBus: typeof EventBus.Service;
  readonly row: DownloadRow;
  readonly animeRow: AnimeRow;
  readonly runtimeConfig: Config;
  readonly storedSourceMetadata: DownloadSourceMetadata | undefined;
  readonly resolvedContentRoot: string;
};

type RuntimeConfigLoader = () => Effect.Effect<Config, RuntimeConfigSnapshotError>;

export const finalizeDownloadImport = Effect.fn("OperationsService.finalizeDownloadImport")(
  function* (input: {
    readonly db: AppDatabase;
    readonly tryDatabasePromise: TryDatabasePromise;
    readonly downloadId: number;
    readonly fromStatus: string;
    readonly now: string;
    readonly animeId: number;
    readonly eventType: string;
    readonly eventMessage: string;
    readonly eventMetadata: string | null;
    readonly logEventType: string;
    readonly logMessage: string;
  }) {
    yield* input.tryDatabasePromise("Failed to reconcile completed download", async () => {
      await input.db.transaction(async (tx) => {
        await tx
          .update(downloads)
          .set({ externalState: "imported", progress: 100, status: "imported" })
          .where(eq(downloads.id, input.downloadId));
        await tx
          .update(downloads)
          .set({ reconciledAt: input.now })
          .where(eq(downloads.id, input.downloadId));
        await tx.insert(downloadEvents).values({
          animeId: input.animeId,
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

export const markDownloadReconciled = Effect.fn("OperationsService.markDownloadReconciled")(
  function* (input: {
    readonly db: AppDatabase;
    readonly tryDatabasePromise: TryDatabasePromise;
    readonly downloadId: number;
    readonly now: string;
  }) {
    yield* input.tryDatabasePromise("Failed to reconcile completed download", async () => {
      await input.db.transaction(async (tx) => {
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

export const loadDownloadReconciliationContext = Effect.fn(
  "OperationsService.loadDownloadReconciliationContext",
)(function* (
  input: Pick<
    DownloadReconciliationContext,
    | "db"
    | "fs"
    | "mediaProbe"
    | "eventBus"
    | "maybeCleanupImportedTorrent"
    | "nowIso"
    | "randomUuid"
    | "row"
    | "tryDatabasePromise"
  > & {
    readonly contentPath: string;
    readonly getRuntimeConfig: RuntimeConfigLoader;
  },
) {
  const storedSourceMetadata = yield* decodeDownloadSourceMetadata(input.row.sourceMetadata);
  const animeRow = yield* requireAnime(input.db, input.row.animeId);
  const runtimeConfig = yield* input.getRuntimeConfig();
  const resolvedContentRoot = yield* resolveAccessibleDownloadPath(
    input.fs,
    input.contentPath,
    runtimeConfig.downloads.remote_path_mappings,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsPathError({
          cause,
          message: `Download content path is inaccessible: ${input.contentPath}`,
        }),
    ),
  );

  if (Option.isNone(resolvedContentRoot)) {
    return Option.none();
  }

  return Option.some({
    db: input.db,
    animeRow,
    eventBus: input.eventBus,
    fs: input.fs,
    mediaProbe: input.mediaProbe,
    maybeCleanupImportedTorrent: input.maybeCleanupImportedTorrent,
    nowIso: input.nowIso,
    resolvedContentRoot: resolvedContentRoot.value,
    randomUuid: input.randomUuid,
    runtimeConfig,
    row: input.row,
    storedSourceMetadata,
    tryDatabasePromise: input.tryDatabasePromise,
  } satisfies DownloadReconciliationContext);
});
