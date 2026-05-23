import type { Config, DownloadSourceMetadata } from "@packages/shared/index.ts";
import { Effect, Option } from "effect";

import type { downloads } from "@/db/schema.ts";
import { media } from "@/db/schema.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { MediaProbeShape } from "@/infra/media/probe.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { DomainPathError } from "@/features/errors.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { DownloadReconciliationRepository } from "@/features/operations/repository/download-reconciliation-repository.ts";
import { decodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import { resolveAccessibleDownloadPath } from "@/features/operations/download/download-paths.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export type DownloadRow = typeof downloads.$inferSelect;
export type MediaRow = typeof media.$inferSelect;

export type MaybeCleanupImportedTorrent = (
  config: Config | null | undefined,
  infoHash: string | null,
) => Effect.Effect<void>;

export type DownloadReconciliationContext = {
  readonly repo: typeof DownloadReconciliationRepository.Service;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly nowIso: () => Effect.Effect<string>;
  readonly randomUuid: () => Effect.Effect<string>;
  readonly maybeCleanupImportedTorrent: MaybeCleanupImportedTorrent;
  readonly eventBus: typeof EventBus.Service;
  readonly row: DownloadRow;
  readonly animeRow: MediaRow;
  readonly runtimeConfig: Config;
  readonly storedSourceMetadata: DownloadSourceMetadata | undefined;
  readonly resolvedContentRoot: string;
};

type RuntimeConfigLoader = () => Effect.Effect<Config, RuntimeConfigSnapshotError>;

export const finalizeDownloadImport = Effect.fn("OperationsService.finalizeDownloadImport")(
  function* (input: {
    readonly repo: typeof DownloadReconciliationRepository.Service;
    readonly downloadId: number;
    readonly fromStatus: string;
    readonly now: string;
    readonly mediaId: number;
    readonly eventType: string;
    readonly eventMessage: string;
    readonly eventMetadata: string | null;
    readonly logEventType: string;
    readonly logMessage: string;
  }) {
    yield* input.repo.finalizeDownloadImport({
      downloadId: input.downloadId,
      fromStatus: input.fromStatus,
      now: input.now,
      mediaId: input.mediaId,
      eventType: input.eventType,
      eventMessage: input.eventMessage,
      eventMetadata: input.eventMetadata,
      logEventType: input.logEventType,
      logMessage: input.logMessage,
    });
  },
);

export const markDownloadReconciled = Effect.fn("OperationsService.markDownloadReconciled")(
  function* (input: {
    readonly repo: typeof DownloadReconciliationRepository.Service;
    readonly downloadId: number;
    readonly now: string;
  }) {
    yield* input.repo.markDownloadReconciled({
      downloadId: input.downloadId,
      now: input.now,
    });
  },
);

export const loadDownloadReconciliationContext = Effect.fn(
  "OperationsService.loadDownloadReconciliationContext",
)(function* (
  input: Pick<
    DownloadReconciliationContext,
    | "repo"
    | "fs"
    | "mediaProbe"
    | "eventBus"
    | "maybeCleanupImportedTorrent"
    | "nowIso"
    | "randomUuid"
    | "row"
  > & {
    readonly contentPath: string;
    readonly getRuntimeConfig: RuntimeConfigLoader;
    readonly mediaReadRepository: typeof MediaReadRepository.Service;
  },
) {
  const storedSourceMetadata = yield* decodeDownloadSourceMetadata(input.row.sourceMetadata);
  const animeRow = yield* input.mediaReadRepository.getAnimeRow(input.row.mediaId);
  const runtimeConfig = yield* input.getRuntimeConfig();
  const resolvedContentRoot = yield* resolveAccessibleDownloadPath(
    input.fs,
    input.contentPath,
    runtimeConfig.downloads.remote_path_mappings,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new DomainPathError({
          cause,
          message: `Download content path is inaccessible: ${input.contentPath}`,
        }),
    ),
  );

  if (Option.isNone(resolvedContentRoot)) {
    return Option.none();
  }

  return Option.some({
    repo: input.repo,
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
  } satisfies DownloadReconciliationContext);
});
