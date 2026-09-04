import * as CommandExecutor from "effect/unstable/process/ChildProcessSpawner";
import { dirname, join, resolve } from "node:path";
import { Cache, Context, Effect, Layer, Schema, Semaphore } from "effect";
import type { ReaderPage, ReaderPagesResponse } from "@packages/shared/index.ts";

import type { DatabaseError } from "@/db/database.ts";
import { AppConfig } from "@/app/config/schema.ts";
import { FileSystem, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { pathBasename } from "@/infra/path.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { resolveUnitFileEffect } from "@/features/media/files/media-file-read.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
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
// Archives are read fully into memory, so refuse anything beyond 2 GiB.
// With a 2 GiB worst case per entry, a capacity of 2 bounds the cache to
// ~4 GiB instead of letting 16 entries pin ~32 GiB.
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const ARCHIVE_CACHE_CAPACITY = 2;
const ARCHIVE_CACHE_TTL = "10 minutes";
const naturalPathCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const UnitFileCacheKeySchema = Schema.fromJsonString(
  Schema.Struct({
    fileName: Schema.String,
    filePath: Schema.String,
    fileSize: Schema.Number,
  }),
);

/** Structured cache key: JSON base64url so every field round-trips safely. */
function unitFileCacheKey(unitFile: ReaderUnitFile) {
  return Buffer.from(
    JSON.stringify({
      fileName: unitFile.fileName,
      filePath: unitFile.filePath,
      fileSize: unitFile.fileSize,
    }),
    "utf8",
  ).toString("base64url");
}

function cacheKeyFile(cacheKey: string): ReaderUnitFile {
  const decoded = Schema.decodeUnknownSync(UnitFileCacheKeySchema)(
    Buffer.from(cacheKey, "base64url").toString("utf8"),
  );

  return {
    fileName: decoded.fileName,
    filePath: decoded.filePath,
    fileSize: decoded.fileSize,
    isDirectory: false,
    isFile: true,
  };
}

const makeMediaReaderService = Effect.fn("MediaReaderService.make")(function* () {
  const fs = yield* FileSystem;
  const mediaRepository = yield* MediaRepository;
  const executor = yield* CommandExecutor.ChildProcessSpawner;
  const config = yield* AppConfig;
  const cacheRoot = join(dirname(resolve(config.databaseFile)), "reader-cache");
  // Effect Cache: per-key lookup dedup (concurrent lookups of the same key share
  // one in-flight load) and automatic TTL eviction — no sweep daemon needed.
  const archiveCache = yield* Cache.make<string, ZipArchive, ReaderAccessError>({
    capacity: ARCHIVE_CACHE_CAPACITY,
    timeToLive: ARCHIVE_CACHE_TTL,
    lookup: (cacheKey) => {
      const file = cacheKeyFile(cacheKey);
      return fs.readFile(file.filePath).pipe(
        Effect.mapError(
          (cause) =>
            new ReaderAccessError({
              cause,
              message: "Failed to read archive file",
              status: 404,
            }),
        ),
        Effect.flatMap((bytes) => parseZipArchive(bytes, file.filePath)),
      );
    },
  });
  const pageSourcesCache = yield* Cache.make<
    string,
    readonly ReaderPageSource[],
    ReaderAccessError
  >({
    capacity: ARCHIVE_CACHE_CAPACITY,
    timeToLive: ARCHIVE_CACHE_TTL,
    lookup: (cacheKey) =>
      deriveReadablePageSources({
        archiveCache,
        cacheRoot,
        executor,
        fs,
        unitFile: cacheKeyFile(cacheKey),
      }),
  });
  const pdfRenderSemaphores = yield* Cache.make<string, Semaphore.Semaphore>({
    capacity: 32,
    lookup: () => Semaphore.make(1),
  });
  const getPdfRenderSemaphore = (cacheDirectory: string) =>
    Cache.get(pdfRenderSemaphores, cacheDirectory);

  const listPages = Effect.fn("MediaReaderService.listPages")(function* (
    mediaId: number,
    unitNumber: number,
  ) {
    const unitFile = yield* resolveReaderUnitFile({
      fs,
      mediaId,
      mediaRepository,
      unitNumber,
    });
    const sources = yield* Cache.get(pageSourcesCache, unitFileCacheKey(unitFile));

    return {
      pages: sources.map((source, index) => toReaderPage(mediaId, unitNumber, source, index)),
    } satisfies ReaderPagesResponse;
  });

  const readPageImage = Effect.fn("MediaReaderService.readPageImage")(function* (
    mediaId: number,
    unitNumber: number,
    pageNumber: number,
  ) {
    const unitFile = yield* resolveReaderUnitFile({
      fs,
      mediaId,
      mediaRepository,
      unitNumber,
    });
    const sources = yield* Cache.get(pageSourcesCache, unitFileCacheKey(unitFile));
    const source = sources[pageNumber - 1];

    if (!source) {
      return yield* new ReaderAccessError({
        message: "Reader page not found",
        status: 404,
      });
    }

    return yield* readPageSourceImage({ executor, fs, getPdfRenderSemaphore, source });
  });

  return { listPages, readPageImage } satisfies MediaReaderServiceShape;
});

export class MediaReaderService extends Context.Service<
  MediaReaderService,
  MediaReaderServiceShape
>()("@bakarr/api/MediaReaderService") {
  static readonly layer = Layer.effect(MediaReaderService, makeMediaReaderService());
}

export const MediaReaderServiceLive = MediaReaderService.layer;

const resolveReaderUnitFile = Effect.fn("MediaReader.resolveReaderUnitFile")(function* (input: {
  readonly fs: FileSystemShape;
  readonly mediaRepository: typeof MediaRepository.Service;
  readonly mediaId: number;
  readonly unitNumber: number;
}) {
  const unitFile = yield* resolveUnitFileEffect({
    fs: input.fs,
    mediaId: input.mediaId,
    mediaRepository: input.mediaRepository,
    unitNumber: input.unitNumber,
  }).pipe(
    Effect.catchTag(
      "UnitFileResolveError",
      (error) =>
        new ReaderAccessError({
          message: error.message,
          status: 404,
        }),
    ),
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

const deriveReadablePageSources = Effect.fn("MediaReader.deriveReadablePageSources")(
  function* (input: {
    readonly archiveCache: Cache.Cache<string, ZipArchive, ReaderAccessError>;
    readonly cacheRoot: string;
    readonly executor: CommandExecutor.ChildProcessSpawner["Service"];
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
      return Array.from(
        { length: pageCount },
        (_, index): ReaderPageSource => ({
          _tag: "PdfPage",
          cacheDirectory: pdfCacheDirectory({
            cacheRoot: input.cacheRoot,
            filePath: input.unitFile.filePath,
            fileSize: input.unitFile.fileSize,
          }),
          fileName: `page-${index + 1}.jpg`,
          filePath: input.unitFile.filePath,
          mediaType: "image/jpeg",
          pageNumber: index + 1,
        }),
      );
    }

    return yield* new ReaderAccessError({
      message: "MediaUnit file type is not readable as pages",
      status: 415,
    });
  },
);

const listArchivePages = Effect.fn("MediaReader.listArchivePages")(function* (input: {
  readonly archiveCache: Cache.Cache<string, ZipArchive, ReaderAccessError>;
  readonly format: "epub" | "zip";
  readonly fs: FileSystemShape;
  readonly unitFile: ReaderUnitFile;
}) {
  if (input.unitFile.fileSize > MAX_ARCHIVE_BYTES) {
    return yield* new ReaderAccessError({
      message: "Archive file exceeds the maximum supported size",
      status: 400,
    });
  }

  // Cache.get dedups concurrent lookups of the same key (one in-flight load).
  const archive = yield* Cache.get(input.archiveCache, unitFileCacheKey(input.unitFile));
  const pages = listArchiveImagePages(archive, input.format).flatMap((page): ReaderPageSource[] => {
    const entry = findZipEntry(archive, page.path);
    return entry
      ? [
          {
            _tag: "ArchivePage",
            archive,
            entry,
            fileName: pathBasename(page.path),
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
  readonly executor: CommandExecutor.ChildProcessSpawner["Service"];
  readonly fs: FileSystemShape;
  readonly getPdfRenderSemaphore: (cacheDirectory: string) => Effect.Effect<Semaphore.Semaphore>;
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

  return yield* Effect.die(new Error("Unsupported reader page source"));
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
