import { CommandExecutor } from "@effect/platform";
import { dirname, join, resolve } from "node:path";
import { Context, Effect, Layer, Match } from "effect";
import type { ReaderPage, ReaderPagesResponse } from "@packages/shared/index.ts";

import { Database, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { AppConfig } from "@/config/schema.ts";
import { FileSystem, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { resolveUnitFileEffect } from "@/features/media/files/media-file-read.ts";
import {
  findZipEntry,
  imageMediaType,
  listArchiveImagePages,
  parseZipArchive,
  readZipEntryBytes,
} from "@/features/media/reader/archive-reader.ts";
import type { ZipArchive, ZipArchiveEntry } from "@/features/media/reader/archive-reader.ts";
import { ReaderAccessError } from "@/features/media/reader/media-reader-errors.ts";
import {
  getPdfPageCount,
  pdfCacheDirectory,
  renderPdfPageToCache,
} from "@/features/media/reader/pdf-reader.ts";

export interface ReaderPageImage {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mediaType: string;
}

export interface MediaReaderServiceShape {
  readonly listPages: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<ReaderPagesResponse, DatabaseError | MediaNotFoundError | ReaderAccessError>;
  readonly readPageImage: (
    mediaId: number,
    unitNumber: number,
    pageNumber: number,
  ) => Effect.Effect<ReaderPageImage, DatabaseError | MediaNotFoundError | ReaderAccessError>;
}

export class MediaReaderService extends Context.Tag("@bakarr/api/MediaReaderService")<
  MediaReaderService,
  MediaReaderServiceShape
>() {}

interface ReaderUnitFile {
  readonly fileName: string;
  readonly filePath: string;
  readonly fileSize: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
}

type ReaderPageSource =
  | {
      readonly _tag: "ArchivePage";
      readonly archive: ZipArchive;
      readonly entry: ZipArchiveEntry;
      readonly fileName: string;
      readonly mediaType: string;
    }
  | {
      readonly _tag: "DirectoryImagePage";
      readonly fileName: string;
      readonly filePath: string;
      readonly mediaType: string;
    }
  | {
      readonly _tag: "ImageFilePage";
      readonly fileName: string;
      readonly filePath: string;
      readonly mediaType: string;
    }
  | {
      readonly _tag: "PdfPage";
      readonly cacheDirectory: string;
      readonly fileName: string;
      readonly filePath: string;
      readonly mediaType: "image/jpeg";
      readonly pageNumber: number;
    };

const ARCHIVE_EXTENSIONS = new Set([".cbz", ".zip"]);
const EPUB_EXTENSIONS = new Set([".epub"]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const ARCHIVE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ARCHIVE_CACHE_SWEEP_INTERVAL_MS = 30_000; // 30 seconds
const naturalPathCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * In-memory archive cache with fixed TTL. Entries expire 10 minutes after
 * insertion — no touch-on-access, so large archives won't live forever
 * even under active reading. A background daemon fiber sweeps expired
 * entries every 30 seconds.
 */
class ArchiveCache {
  readonly #entries = new Map<string, { archive: ZipArchive; expiresAt: number }>();
  readonly #ttlMs: number;

  constructor(ttlMs: number) {
    this.#ttlMs = ttlMs;
  }

  get(key: string): ZipArchive | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry.archive;
  }

  set(key: string, archive: ZipArchive): void {
    this.#entries.set(key, { archive, expiresAt: Date.now() + this.#ttlMs });
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.#entries) {
      if (now > entry.expiresAt) {
        this.#entries.delete(key);
      }
    }
  }
}

const makeMediaReaderService = Effect.fn("MediaReaderService.make")(function* () {
  const { db } = yield* Database;
  const fs = yield* FileSystem;
  const executor = yield* CommandExecutor.CommandExecutor;
  const config = yield* AppConfig;
  const cacheRoot = join(dirname(resolve(config.databaseFile)), "reader-cache");
  const archiveCache = new ArchiveCache(ARCHIVE_CACHE_TTL_MS);
  const pdfRenderSemaphores = new Map<string, Effect.Semaphore>();

  // Background fiber that sweeps expired archive cache entries
  yield* Effect.forkDaemon(
    Effect.forever(
      Effect.sleep(ARCHIVE_CACHE_SWEEP_INTERVAL_MS).pipe(
        Effect.tap(() => Effect.sync(() => archiveCache.sweep())),
      ),
    ),
  );

  const getPdfRenderSemaphore = (cacheDirectory: string) =>
    Effect.gen(function* () {
      const existing = pdfRenderSemaphores.get(cacheDirectory);
      if (existing) {
        return existing;
      }
      const created = yield* Effect.makeSemaphore(1);
      pdfRenderSemaphores.set(cacheDirectory, created);
      return created;
    });

  const listPages = Effect.fn("MediaReaderService.listPages")(function* (
    mediaId: number,
    unitNumber: number,
  ) {
    const unitFile = yield* resolveReaderUnitFile({ db, fs, mediaId, unitNumber });
    const sources = yield* listReadablePageSources({
      archiveCache,
      cacheRoot,
      executor,
      fs,
      unitFile,
    });

    return {
      pages: sources.map((source, index) => toReaderPage(mediaId, unitNumber, source, index)),
    } satisfies ReaderPagesResponse;
  });

  const readPageImage = Effect.fn("MediaReaderService.readPageImage")(function* (
    mediaId: number,
    unitNumber: number,
    pageNumber: number,
  ) {
    const unitFile = yield* resolveReaderUnitFile({ db, fs, mediaId, unitNumber });
    const sources = yield* listReadablePageSources({
      archiveCache,
      cacheRoot,
      executor,
      fs,
      unitFile,
    });
    const source = sources[pageNumber - 1];

    if (!source) {
      return yield* new ReaderAccessError({
        message: "Reader page not found",
        status: 404,
      });
    }

    return yield* readPageSourceImage({ executor, fs, getPdfRenderSemaphore, source });
  });

  return MediaReaderService.of({ listPages, readPageImage });
});

export const MediaReaderServiceLive = Layer.effect(MediaReaderService, makeMediaReaderService());

const resolveReaderUnitFile = Effect.fn("MediaReader.resolveReaderUnitFile")(function* (input: {
  readonly db: AppDatabase;
  readonly fs: FileSystemShape;
  readonly mediaId: number;
  readonly unitNumber: number;
}) {
  const resolvedEpisodeFile = yield* resolveUnitFileEffect({
    db: input.db,
    fs: input.fs,
    mediaId: input.mediaId,
    unitNumber: input.unitNumber,
  });

  const unitFile = yield* Match.value(resolvedEpisodeFile).pipe(
    Match.tag("EpisodeFileUnmapped", "EpisodeFileMissing", () =>
      Effect.fail(new ReaderAccessError({ message: "MediaUnit file not found", status: 404 })),
    ),
    Match.tag("EpisodeFileRootInaccessible", () =>
      Effect.fail(
        new ReaderAccessError({
          message: "Media root folder is inaccessible",
          status: 404,
        }),
      ),
    ),
    Match.tag("EpisodeFileOutsideRoot", () =>
      Effect.fail(
        new ReaderAccessError({
          message: "MediaUnit file mapping is invalid",
          status: 404,
        }),
      ),
    ),
    Match.tag("EpisodeFileResolved", (file) => Effect.succeed(file)),
    Match.exhaustive,
  );

  const fileInfo = yield* input.fs.stat(unitFile.filePath).pipe(
    Effect.mapError(
      (cause) =>
        new ReaderAccessError({
          cause,
          message: "MediaUnit file not found",
          status: 404,
        }),
    ),
  );

  return {
    fileName: unitFile.fileName,
    filePath: unitFile.filePath,
    fileSize: fileInfo.size,
    isDirectory: fileInfo.isDirectory,
    isFile: fileInfo.isFile,
  } satisfies ReaderUnitFile;
});

const listReadablePageSources = Effect.fn("MediaReader.listReadablePageSources")(function* (input: {
  readonly archiveCache: ArchiveCache;
  readonly cacheRoot: string;
  readonly executor: CommandExecutor.CommandExecutor;
  readonly fs: FileSystemShape;
  readonly unitFile: ReaderUnitFile;
}) {
  if (input.unitFile.isDirectory) {
    return yield* listDirectoryImagePages(input.fs, input.unitFile.filePath);
  }

  if (!input.unitFile.isFile) {
    return yield* new ReaderAccessError({
      message: "MediaUnit path is not a readable file or directory",
      status: 415,
    });
  }

  const mediaType = imageMediaType(input.unitFile.fileName);
  if (mediaType) {
    return [
      {
        _tag: "ImageFilePage",
        fileName: input.unitFile.fileName,
        filePath: input.unitFile.filePath,
        mediaType,
      } satisfies ReaderPageSource,
    ];
  }

  if (hasExtension(input.unitFile.fileName, ARCHIVE_EXTENSIONS)) {
    return yield* listArchivePages({
      archiveCache: input.archiveCache,
      format: "zip",
      fs: input.fs,
      unitFile: input.unitFile,
    });
  }

  if (hasExtension(input.unitFile.fileName, EPUB_EXTENSIONS)) {
    return yield* listArchivePages({
      archiveCache: input.archiveCache,
      format: "epub",
      fs: input.fs,
      unitFile: input.unitFile,
    });
  }

  if (hasExtension(input.unitFile.fileName, PDF_EXTENSIONS)) {
    const pageCount = yield* getPdfPageCount(input.executor, input.unitFile.filePath);
    return Array.from({ length: pageCount }, (_, index) => ({
      _tag: "PdfPage" as const,
      cacheDirectory: pdfCacheDirectory({
        cacheRoot: input.cacheRoot,
        filePath: input.unitFile.filePath,
        fileSize: input.unitFile.fileSize,
      }),
      fileName: `page-${index + 1}.jpg`,
      filePath: input.unitFile.filePath,
      mediaType: "image/jpeg" as const,
      pageNumber: index + 1,
    }));
  }

  return yield* new ReaderAccessError({
    message: "MediaUnit file type is not readable as pages",
    status: 415,
  });
});

const listArchivePages = Effect.fn("MediaReader.listArchivePages")(function* (input: {
  readonly archiveCache: ArchiveCache;
  readonly format: "epub" | "zip";
  readonly fs: FileSystemShape;
  readonly unitFile: ReaderUnitFile;
}) {
  const cacheKey = `${input.unitFile.filePath}:${input.unitFile.fileSize}`;
  const archive = yield* Effect.sync(() => input.archiveCache.get(cacheKey)).pipe(
    Effect.flatMap((cached) =>
      cached
        ? Effect.succeed(cached)
        : input.fs.readFile(input.unitFile.filePath).pipe(
            Effect.mapError(
              (cause) =>
                new ReaderAccessError({
                  cause,
                  message: "Failed to read archive file",
                  status: 404,
                }),
            ),
            Effect.flatMap((bytes) => parseZipArchive(bytes, input.unitFile.filePath)),
            Effect.tap((parsed) =>
              Effect.sync(() => input.archiveCache.set(cacheKey, parsed)),
            ),
          ),
    ),
  );
  const pages = listArchiveImagePages(archive, input.format).flatMap((page) => {
    const entry = findZipEntry(archive, page.path);
    return entry
      ? [
          {
            _tag: "ArchivePage" as const,
            archive,
            entry,
            fileName: page.path.split("/").at(-1) ?? page.path,
            mediaType: page.mediaType,
          },
        ]
      : [];
  });

  if (pages.length === 0) {
    return yield* new ReaderAccessError({
      message: "No readable image pages were found",
      status: 404,
    });
  }

  return pages;
});

const listDirectoryImagePages = Effect.fn("MediaReader.listDirectoryImagePages")(function* (
  fs: FileSystemShape,
  rootPath: string,
) {
  const pending = [rootPath];
  const pages: Extract<ReaderPageSource, { _tag: "DirectoryImagePage" }>[] = [];

  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) {
      continue;
    }

    const entries = yield* fs.readDir(directory).pipe(
      Effect.mapError(
        (cause) =>
          new ReaderAccessError({
            cause,
            message: "Failed to read image directory",
            status: 404,
          }),
      ),
    );

    for (const entry of entries.toSorted((a, b) => naturalPathCollator.compare(a.name, b.name))) {
      if (entry.isSymlink) {
        continue;
      }

      const entryPath = join(directory, entry.name);
      if (entry.isDirectory) {
        pending.push(entryPath);
        continue;
      }

      const mediaType = entry.isFile ? imageMediaType(entry.name) : undefined;
      if (mediaType) {
        pages.push({
          _tag: "DirectoryImagePage",
          fileName: entry.name,
          filePath: entryPath,
          mediaType,
        });
      }
    }
  }

  const sortedPages = pages.toSorted((a, b) => naturalPathCollator.compare(a.filePath, b.filePath));

  if (sortedPages.length === 0) {
    return yield* new ReaderAccessError({
      message: "No readable image pages were found",
      status: 404,
    });
  }

  return sortedPages;
});

const readPageSourceImage = Effect.fn("MediaReader.readPageSourceImage")(function* (input: {
  readonly executor: CommandExecutor.CommandExecutor;
  readonly fs: FileSystemShape;
  readonly getPdfRenderSemaphore: (cacheDirectory: string) => Effect.Effect<Effect.Semaphore>;
  readonly source: ReaderPageSource;
}) {
  switch (input.source._tag) {
    case "ArchivePage": {
      const bytes = yield* readZipEntryBytes(input.source.archive, input.source.entry);
      return {
        bytes,
        fileName: input.source.fileName,
        mediaType: input.source.mediaType,
      } satisfies ReaderPageImage;
    }
    case "DirectoryImagePage":
    case "ImageFilePage": {
      const bytes = yield* readImageFile(input.fs, input.source.filePath);
      return {
        bytes,
        fileName: input.source.fileName,
        mediaType: input.source.mediaType,
      } satisfies ReaderPageImage;
    }
    case "PdfPage": {
      const semaphore = yield* input.getPdfRenderSemaphore(input.source.cacheDirectory);
      const renderedPath = yield* renderPdfPageToCache({
        cacheDirectory: input.source.cacheDirectory,
        executor: input.executor,
        filePath: input.source.filePath,
        fs: input.fs,
        pageNumber: input.source.pageNumber,
        renderSemaphore: semaphore,
      });
      const bytes = yield* readImageFile(input.fs, renderedPath);
      return {
        bytes,
        fileName: input.source.fileName,
        mediaType: input.source.mediaType,
      } satisfies ReaderPageImage;
    }
  }

  return yield* Effect.dieMessage("Unsupported reader page source");
});

function readImageFile(fs: FileSystemShape, filePath: string) {
  return fs.readFile(filePath).pipe(
    Effect.mapError(
      (cause) =>
        new ReaderAccessError({
          cause,
          message: "Failed to read page image",
          status: 404,
        }),
    ),
  );
}

function toReaderPage(
  mediaId: number,
  unitNumber: number,
  source: ReaderPageSource,
  index: number,
): ReaderPage {
  const pageNumber = index + 1;

  return {
    index,
    media_type: source.mediaType,
    page_number: pageNumber,
    url: `/api/media/${mediaId}/units/${unitNumber}/pages/${pageNumber}/image`,
  };
}

function hasExtension(fileName: string, extensions: ReadonlySet<string>) {
  const lowerFileName = fileName.toLowerCase();
  for (const extension of extensions) {
    if (lowerFileName.endsWith(extension)) {
      return true;
    }
  }

  return false;
}
