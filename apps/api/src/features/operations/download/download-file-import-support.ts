import { Effect } from "effect";

import type { DownloadSourceMetadata, ImportMode, PreferredTitle } from "@packages/shared/index.ts";
import { anime } from "@/db/schema.ts";
import { ImportFileError } from "@/features/operations/download/download-file-import-errors.ts";
import { buildDownloadFileImportPlan } from "@/features/operations/download/download-file-import-plan-support.ts";
import { replaceDestinationWithStagedFile } from "@/features/operations/download/download-file-import-replace-support.ts";
import {
  cleanupStagedTempFile,
  stageSourceIntoTempFile,
} from "@/features/operations/download/download-file-import-staging-support.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { ProbedMediaMetadata } from "@/infra/media/probe.ts";

export { ImportFileError };

export const importDownloadedFile = Effect.fn("Operations.importDownloadedFile")(function* (
  fs: FileSystemShape,
  animeRow: typeof anime.$inferSelect,
  episodeNumber: number,
  sourcePath: string,
  importMode: ImportMode,
  options: {
    randomUuid: () => Effect.Effect<string>;
    episodeNumbers?: readonly number[];
    namingFormat?: string;
    preferredTitle?: PreferredTitle;
    episodeRows?: readonly { title?: string | null; aired?: string | null }[];
    downloadSourceMetadata?: DownloadSourceMetadata;
    localMediaMetadata?: ProbedMediaMetadata;
    season?: number;
  },
) {
  if (
    sourcePath.startsWith(animeRow.rootFolder.replace(/\/$/, "") + "/") ||
    sourcePath === animeRow.rootFolder
  ) {
    return sourcePath;
  }

  const allEpisodes = options?.episodeNumbers?.length ? options.episodeNumbers : [episodeNumber];
  const importPlan = yield* buildDownloadFileImportPlan({
    animeRow,
    episodeNumbers: allEpisodes,
    options,
    randomUuid: options.randomUuid,
    sourcePath,
  });

  yield* fs.mkdir(animeRow.rootFolder, { recursive: true });
  yield* Effect.acquireUseRelease(
    stageSourceIntoTempFile({
      fs,
      importMode,
      sourcePath,
      tempDestination: importPlan.tempDestination,
    }).pipe(Effect.as(importPlan.tempDestination)),
    (tempDestination) =>
      replaceDestinationWithStagedFile({
        backupDestination: importPlan.backupDestination,
        destination: importPlan.destination,
        fs,
        tempDestination,
      }),
    (tempDestination) => cleanupStagedTempFile(fs, tempDestination),
  );

  return importPlan.destination;
});
