import { Command, CommandExecutor } from "@effect/platform";
import { createHash } from "node:crypto";
import { Effect } from "effect";

import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { ReaderAccessError } from "@/features/media/reader/media-reader-errors.ts";

const PDF_INFO_TIMEOUT_MS = 10_000;
const PDF_RENDER_TIMEOUT_MS = 30_000;
const PDF_RENDER_DPI = "180";

export function pdfCacheDirectory(input: {
  readonly cacheRoot: string;
  readonly filePath: string;
  readonly fileSize: number;
}) {
  const hash = createHash("sha256")
    .update(input.filePath)
    .update("\0")
    .update(String(input.fileSize))
    .digest("hex");

  return `${input.cacheRoot}/pdf/${hash}`;
}

export const getPdfPageCount = Effect.fn("MediaReader.getPdfPageCount")(function* (
  executor: CommandExecutor.CommandExecutor,
  filePath: string,
) {
  const output = yield* runPdfCommand({
    args: [filePath],
    command: "pdfinfo",
    executor,
    failureMessage: "Failed to inspect PDF pages",
    timeoutMs: PDF_INFO_TIMEOUT_MS,
  });
  const match = /^Pages:\s*(\d+)\s*$/im.exec(output);
  const pageCount = match?.[1] ? Number.parseInt(match[1], 10) : NaN;

  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    return yield* new ReaderAccessError({
      message: "PDF page count could not be read",
      status: 400,
    });
  }

  return pageCount;
});

export const renderPdfPageToCache = Effect.fn("MediaReader.renderPdfPageToCache")(
  function* (input: {
    readonly cacheDirectory: string;
    readonly executor: CommandExecutor.CommandExecutor;
    readonly filePath: string;
    readonly fs: FileSystemShape;
    readonly pageNumber: number;
    readonly renderSemaphore: Effect.Semaphore;
  }) {
    return yield* input.renderSemaphore.withPermits(1)(
      Effect.gen(function* () {
        yield* input.fs.mkdir(input.cacheDirectory, { recursive: true }).pipe(
          Effect.mapError(
            (cause) =>
              new ReaderAccessError({
                cause,
                message: "Failed to create PDF reader cache directory",
                status: 500,
              }),
          ),
        );

        const outputPrefix = `${input.cacheDirectory}/page-${input.pageNumber}`;
        const outputPath = `${outputPrefix}.jpg`;
        const cached = yield* pathExists(input.fs, outputPath);
        if (cached) {
          return outputPath;
        }

        yield* runPdfCommand({
          args: [
            "-f",
            input.pageNumber.toString(),
            "-l",
            input.pageNumber.toString(),
            "-r",
            PDF_RENDER_DPI,
            "-jpeg",
            "-singlefile",
            input.filePath,
            outputPrefix,
          ],
          command: "pdftoppm",
          executor: input.executor,
          failureMessage: "Failed to render PDF page",
          timeoutMs: PDF_RENDER_TIMEOUT_MS,
        });

        const rendered = yield* pathExists(input.fs, outputPath);
        if (!rendered) {
          return yield* new ReaderAccessError({
            message: "PDF renderer did not produce a page image",
            status: 500,
          });
        }

        return outputPath;
      }),
    );
  },
);

function runPdfCommand(input: {
  readonly args: readonly string[];
  readonly command: string;
  readonly executor: CommandExecutor.CommandExecutor;
  readonly failureMessage: string;
  readonly timeoutMs: number;
}) {
  return Effect.suspend(() =>
    input.executor.string(Command.make(input.command, ...input.args)),
  ).pipe(
    Effect.timeoutFail({
      duration: `${input.timeoutMs} millis`,
      onTimeout: () =>
        new ReaderAccessError({
          cause: "Timeout",
          message: `${input.failureMessage}: command timed out`,
          status: 500,
        }),
    }),
    Effect.mapError((cause) =>
      cause instanceof ReaderAccessError
        ? cause
        : new ReaderAccessError({
            cause,
            message: input.failureMessage,
            status: 500,
          }),
    ),
  );
}

function pathExists(fs: FileSystemShape, path: string) {
  return fs.stat(path).pipe(
    Effect.as(true),
    Effect.catchAll(() => Effect.succeed(false)),
  );
}
