import { Effect, Stream } from "effect";

import type { ScannedFile, SkippedFile } from "@packages/shared/index.ts";
import { scanVideoFilesStream } from "@/features/operations/file-scanner.ts";
import { resolveImportScanLimit } from "@/features/operations/import-path-scan-policy.ts";
import { OperationsPathError } from "@/features/operations/errors.ts";
import {
  analyzeScannedFile,
  type AnalyzedFile,
} from "@/features/operations/library-import-analysis-support.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";

export interface DiscoverImportScanFilesResult {
  readonly canonicalPath: string;
  readonly analyzed: AnalyzedFile[];
  readonly episodeFiles: AnalyzedFile[];
  readonly skippedFiles: SkippedFile[];
  readonly truncated: boolean;
}

export const discoverImportScanFiles = Effect.fn("Operations.discoverImportScanFiles")(
  function* (input: {
    readonly fs: FileSystemShape;
    readonly limit?: number;
    readonly path: string;
  }) {
    const canonicalPath = yield* input.fs.realPath(input.path).pipe(
      Effect.mapError(
        (cause) =>
          new OperationsPathError({
            cause,
            message: `Import path is inaccessible: ${input.path}`,
          }),
      ),
    );

    const limit = resolveImportScanLimit(input.limit);
    const scannedFiles = Array.from(
      yield* scanVideoFilesStream(input.fs, canonicalPath).pipe(
        Stream.take(limit + 1),
        Stream.runCollect,
        Effect.mapError(
          (cause) =>
            new OperationsPathError({
              cause,
              message: `Import path is inaccessible: ${canonicalPath}`,
            }),
        ),
      ),
    );
    const truncated = scannedFiles.length > limit;
    const files = (truncated ? scannedFiles.slice(0, limit) : scannedFiles).toSorted((a, b) =>
      a.path.localeCompare(b.path),
    );
    const analyzed = files.map((file) => analyzeScannedFile(file, canonicalPath));
    const episodeFiles = analyzed.filter((entry) => !entry.skipped);
    const skippedFiles = analyzed.flatMap((entry) => (entry.skipped ? [entry.skipped] : []));

    return {
      analyzed,
      canonicalPath,
      episodeFiles,
      skippedFiles,
      truncated,
    } satisfies DiscoverImportScanFilesResult;
  },
);

export function extractScanCandidatePaths(files: readonly Pick<ScannedFile, "source_path">[]) {
  return [...new Set(files.map((entry) => entry.source_path).filter((value) => value.length > 0))];
}
