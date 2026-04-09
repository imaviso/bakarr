import { Effect } from "effect";

import type { Config, ImportResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import type { MediaProbeShape } from "@/lib/media-probe.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { buildLibraryImportPlan } from "@/features/operations/catalog-library-write-import-plan-support.ts";
import { writeLibraryImportFile } from "@/features/operations/catalog-library-write-import-file-support.ts";

export interface LibraryImportFileInput {
  readonly source_path: string;
  readonly anime_id: number;
  readonly episode_number: number;
  readonly episode_numbers?: readonly number[];
  readonly season?: number;
}

export interface ImportLibraryFilesInput {
  readonly db: AppDatabase;
  readonly eventBus: typeof EventBus.Service;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly runtimeConfig: Config;
  readonly tryDatabasePromise: import("@/lib/effect-db.ts").TryDatabasePromise;
  readonly files: readonly LibraryImportFileInput[];
}

export const importLibraryFiles = Effect.fn("Operations.importLibraryFiles")((
  input: ImportLibraryFilesInput,
): Effect.Effect<
  ImportResult,
  | import("@/db/database.ts").DatabaseError
  | import("@/features/operations/errors.ts").OperationsPathError
  | import("@/features/operations/errors.ts").OperationsInfrastructureError
  | import("@/features/operations/errors.ts").OperationsAnimeNotFoundError
> => {
  const { db, eventBus, fs, mediaProbe, runtimeConfig, tryDatabasePromise, files } = input;
  return Effect.gen(function* () {
    const importedFiles: ImportResult["imported_files"] = [];
    const failedFiles: ImportResult["failed_files"] = [];

    for (const file of files) {
      const planned = yield* buildLibraryImportPlan({
        db,
        fs,
        mediaProbe,
        runtimeConfig,
        tryDatabasePromise,
        file,
      }).pipe(Effect.either);

      if (planned._tag === "Left") {
        failedFiles.push({
          source_path: file.source_path,
          error: planned.left instanceof Error ? planned.left.message : String(planned.left),
        });
        continue;
      }

      const imported = yield* writeLibraryImportFile({ db, fs, plan: planned.right }).pipe(
        Effect.either,
      );
      if (imported._tag === "Left") {
        failedFiles.push({
          source_path: file.source_path,
          error: imported.left instanceof Error ? imported.left.message : String(imported.left),
        });
        continue;
      }

      importedFiles.push(imported.right);
    }

    yield* eventBus.publish({
      type: "ImportFinished",
      payload: {
        count: files.length,
        imported: importedFiles.length,
        failed: failedFiles.length,
      },
    });

    return {
      imported: importedFiles.length,
      failed: failedFiles.length,
      imported_files: importedFiles,
      failed_files: failedFiles,
    } satisfies ImportResult;
  });
});
