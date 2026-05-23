import { Effect } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { DownloadReconciliationRepository } from "@/features/operations/repository/download-reconciliation-repository.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import { DomainConflictError, DomainNotFoundError } from "@/features/errors.ts";
import { type OperationsError } from "@/features/operations/errors.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export function makeReconcileDownloadByIdEffect(input: {
  readonly repo: typeof DownloadReconciliationRepository.Service;
  readonly reconcileCompletedTorrentEffect: (
    infoHash: string,
    contentPath: string | undefined,
  ) => Effect.Effect<
    void,
    ExternalCallError | OperationsError | DatabaseError | RuntimeConfigSnapshotError
  >;
}) {
  const { repo, reconcileCompletedTorrentEffect } = input;

  return Effect.fn("OperationsService.reconcileDownloadById")(function* (id: number) {
    const row = yield* repo.loadDownloadById(id);

    if (!row) {
      return yield* new DomainNotFoundError({
        message: "Download not found",
      });
    }

    const contentPath = row.contentPath ?? row.savePath;

    if (!contentPath || !row.infoHash) {
      return yield* new DomainConflictError({
        message: "Download has no reconciliable content path",
      });
    }

    yield* reconcileCompletedTorrentEffect(row.infoHash, contentPath ?? undefined);
    return undefined;
  });
}
