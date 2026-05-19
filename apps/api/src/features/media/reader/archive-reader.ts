import { inflateRawSync } from "node:zlib";
import { posix } from "node:path";
import { Effect } from "effect";

import { ReaderAccessError } from "@/features/media/reader/media-reader-errors.ts";

export interface ArchivePageEntry {
  readonly path: string;
  readonly mediaType: string;
}

export interface ZipArchiveEntry {
  readonly compressedSize: number;
  readonly compressionMethod: number;
  readonly generalPurposeBitFlag: number;
  readonly localHeaderOffset: number;
  readonly path: string;
  readonly uncompressedSize: number;
}

export interface ZipArchive {
  readonly bytes: Uint8Array;
  readonly entries: readonly ZipArchiveEntry[];
}

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const UINT32_MAX = 0xffffffff;
const UINT16_MAX = 0xffff;
const ZIP_EOCD_MIN_LENGTH = 22;
const ZIP_MAX_COMMENT_LENGTH = 0xffff;
const ZIP_STORED_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;
const ZIP_ENCRYPTED_FLAG = 1;

const textDecoder = new TextDecoder("utf-8");
const naturalPathCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const IMAGE_MEDIA_TYPES = new Map<string, string>([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export function imageMediaType(path: string): string | undefined {
  const lowerPath = path.toLowerCase();
  for (const [extension, mediaType] of IMAGE_MEDIA_TYPES) {
    if (lowerPath.endsWith(extension)) {
      return mediaType;
    }
  }

  return undefined;
}

export function listArchiveImagePages(archive: ZipArchive, format: "epub" | "zip") {
  const epubPages = format === "epub" ? listEpubImagePages(archive) : [];
  const pages = epubPages.length > 0 ? epubPages : listZipImageEntries(archive.entries);

  return pages;
}

export const parseZipArchive = Effect.fn("MediaReader.parseZipArchive")(function* (
  bytes: Uint8Array,
  filePath: string,
) {
  return yield* Effect.try({
    try: () => parseZipArchiveUnsafe(bytes),
    catch: (cause) =>
      new ReaderAccessError({
        cause,
        message: `Failed to read archive pages from ${filePath}`,
        status: 400,
      }),
  });
});

export const readZipEntryBytes = Effect.fn("MediaReader.readZipEntryBytes")(function* (
  archive: ZipArchive,
  entry: ZipArchiveEntry,
) {
  if ((entry.generalPurposeBitFlag & ZIP_ENCRYPTED_FLAG) !== 0) {
    return yield* new ReaderAccessError({
      message: "Encrypted archive pages are not supported",
      status: 415,
    });
  }

  const bytes = archive.bytes;
  const compressed = yield* Effect.try({
    try: () => {
      const localHeader = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (readUint32(localHeader, entry.localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
        throw new Error("Archive page local header is invalid");
      }

      const fileNameLength = readUint16(localHeader, entry.localHeaderOffset + 26);
      const extraLength = readUint16(localHeader, entry.localHeaderOffset + 28);
      const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
      const dataEnd = dataStart + entry.compressedSize;

      if (dataStart < 0 || dataEnd > bytes.byteLength) {
        throw new Error("Archive page data points outside the archive");
      }

      return bytes.subarray(dataStart, dataEnd);
    },
    catch: (cause) =>
      new ReaderAccessError({
        cause,
        message: "Archive page data is invalid",
        status: 400,
      }),
  });

  if (entry.compressionMethod === ZIP_STORED_METHOD) {
    return compressed;
  }

  if (entry.compressionMethod !== ZIP_DEFLATE_METHOD) {
    return yield* new ReaderAccessError({
      message: `Archive compression method ${entry.compressionMethod} is not supported`,
      status: 415,
    });
  }

  return yield* Effect.try({
    try: () => Uint8Array.from(inflateRawSync(Buffer.from(compressed))),
    catch: (cause) =>
      new ReaderAccessError({
        cause,
        message: "Failed to decompress archive page",
        status: 400,
      }),
  });
});

export function findZipEntry(archive: ZipArchive, path: string): ZipArchiveEntry | undefined {
  return archive.entries.find((entry) => entry.path === path);
}

function parseZipArchiveUnsafe(bytes: Uint8Array): ZipArchive {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectoryOffset(view);

  if (eocdOffset === undefined) {
    throw new Error("Archive is missing its ZIP central directory");
  }

  const totalEntries = readUint16(view, eocdOffset + 10);
  const centralDirectorySize = readUint32(view, eocdOffset + 12);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);

  if (
    totalEntries === UINT16_MAX ||
    centralDirectorySize === UINT32_MAX ||
    centralDirectoryOffset === UINT32_MAX
  ) {
    throw new Error("ZIP64 archives are not supported");
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > bytes.byteLength) {
    throw new Error("Archive central directory points outside the file");
  }

  const entries: ZipArchiveEntry[] = [];
  let offset = centralDirectoryOffset;

  while (offset < centralDirectoryEnd) {
    if (readUint32(view, offset) !== CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      throw new Error("Archive central directory header is invalid");
    }

    const generalPurposeBitFlag = readUint16(view, offset + 8);
    const compressionMethod = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;

    if (fileNameEnd > bytes.byteLength) {
      throw new Error("Archive entry name points outside the file");
    }

    const rawName = bytes.subarray(fileNameStart, fileNameEnd);
    const decodedName = decodeZipEntryName(rawName, generalPurposeBitFlag).replaceAll("\\", "/");
    const normalizedPath = normalizeArchivePath(decodedName);

    if (normalizedPath.length > 0 && !normalizedPath.endsWith("/")) {
      entries.push({
        compressedSize,
        compressionMethod,
        generalPurposeBitFlag,
        localHeaderOffset,
        path: normalizedPath,
        uncompressedSize,
      });
    }

    offset = fileNameEnd + extraLength + commentLength;
  }

  return { bytes, entries };
}

function findEndOfCentralDirectoryOffset(view: DataView) {
  const minOffset = Math.max(0, view.byteLength - ZIP_EOCD_MIN_LENGTH - ZIP_MAX_COMMENT_LENGTH);

  for (let offset = view.byteLength - ZIP_EOCD_MIN_LENGTH; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  return undefined;
}

function listZipImageEntries(entries: readonly ZipArchiveEntry[]): ArchivePageEntry[] {
  return entries
    .filter((entry) => !isJunkArchivePath(entry.path))
    .flatMap((entry) => {
      const mediaType = imageMediaType(entry.path);
      return mediaType ? [{ mediaType, path: entry.path }] : [];
    })
    .toSorted(compareArchivePages);
}

function listEpubImagePages(archive: ZipArchive): ArchivePageEntry[] {
  const container = readZipEntryTextSync(archive, "META-INF/container.xml");
  const rootFilePath = container ? getRootFilePath(container) : undefined;
  if (!rootFilePath) {
    return [];
  }

  const opf = readZipEntryTextSync(archive, rootFilePath);
  if (!opf) {
    return [];
  }

  const manifest = parseOpfManifest(opf, rootFilePath);
  const spineDocumentPaths = parseOpfSpineItemIds(opf).flatMap((itemId) => {
    const manifestItem = manifest.get(itemId);
    return manifestItem && isHtmlMediaType(manifestItem.mediaType) ? [manifestItem.path] : [];
  });
  const pages: ArchivePageEntry[] = [];

  for (const documentPath of spineDocumentPaths) {
    const document = readZipEntryTextSync(archive, documentPath);
    if (!document) {
      continue;
    }

    for (const imagePath of extractHtmlImagePaths(document, documentPath)) {
      const entry = findZipEntry(archive, imagePath);
      const mediaType = entry ? imageMediaType(entry.path) : undefined;
      if (entry && mediaType) {
        pages.push({ mediaType, path: entry.path });
      }
    }
  }

  const coverPage = findEpubCoverPage(archive, manifest, opf);
  return dedupePages(coverPage ? [coverPage, ...pages] : pages);
}

function readZipEntryTextSync(archive: ZipArchive, path: string): string | undefined {
  const entry = findZipEntry(archive, normalizeArchivePath(path));
  if (
    !entry ||
    (entry.compressionMethod !== ZIP_STORED_METHOD &&
      entry.compressionMethod !== ZIP_DEFLATE_METHOD)
  ) {
    return undefined;
  }

  try {
    const localHeader = new DataView(
      archive.bytes.buffer,
      archive.bytes.byteOffset,
      archive.bytes.byteLength,
    );
    const fileNameLength = readUint16(localHeader, entry.localHeaderOffset + 26);
    const extraLength = readUint16(localHeader, entry.localHeaderOffset + 28);
    const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    const compressed = archive.bytes.subarray(dataStart, dataEnd);
    const bytes =
      entry.compressionMethod === ZIP_STORED_METHOD
        ? compressed
        : inflateRawSync(Buffer.from(compressed));

    return textDecoder.decode(bytes);
  } catch {
    return undefined;
  }
}

interface OpfManifestItem {
  readonly id: string;
  readonly mediaType?: string | undefined;
  readonly path: string;
  readonly properties?: string | undefined;
}

function parseOpfManifest(opf: string, opfPath: string): Map<string, OpfManifestItem> {
  const manifest = new Map<string, OpfManifestItem>();
  const opfDirectory = posix.dirname(opfPath);

  for (const match of opf.matchAll(/<item\b([^>]*)>/gi)) {
    const attributesSource = match[1];
    if (attributesSource === undefined) {
      continue;
    }

    const attributes = parseXmlAttributes(attributesSource);
    const id = attributes.get("id");
    const href = attributes.get("href");
    if (!id || !href) {
      continue;
    }

    manifest.set(id, {
      id,
      mediaType: attributes.get("media-type"),
      path: resolveArchiveReference(opfDirectory, href),
      properties: attributes.get("properties"),
    });
  }

  return manifest;
}

function parseOpfSpineItemIds(opf: string): string[] {
  return [...opf.matchAll(/<itemref\b([^>]*)>/gi)].flatMap((match) => {
    const attributesSource = match[1];
    if (attributesSource === undefined) {
      return [];
    }

    const idref = parseXmlAttributes(attributesSource).get("idref");
    return idref ? [idref] : [];
  });
}

function extractHtmlImagePaths(document: string, documentPath: string): string[] {
  const documentDirectory = posix.dirname(documentPath);
  const imagePaths: string[] = [];

  for (const match of document.matchAll(/<(?:img|image)\b([^>]*)>/gi)) {
    const attributesSource = match[1];
    if (attributesSource === undefined) {
      continue;
    }

    const attributes = parseXmlAttributes(attributesSource);
    const src = attributes.get("src") ?? attributes.get("href") ?? attributes.get("xlink:href");
    if (src) {
      imagePaths.push(resolveArchiveReference(documentDirectory, src));
    }
  }

  return imagePaths;
}

function findEpubCoverPage(
  archive: ZipArchive,
  manifest: ReadonlyMap<string, OpfManifestItem>,
  opf: string,
): ArchivePageEntry | undefined {
  const coverMetaId = [...opf.matchAll(/<meta\b([^>]*)>/gi)]
    .map((match) => (match[1] === undefined ? undefined : parseXmlAttributes(match[1])))
    .find((attributes) => attributes?.get("name") === "cover")
    ?.get("content");
  const coverItem =
    (coverMetaId ? manifest.get(decodeXmlText(coverMetaId)) : undefined) ??
    [...manifest.values()].find((item) => item.properties?.split(/\s+/).includes("cover-image"));
  const entry = coverItem ? findZipEntry(archive, coverItem.path) : undefined;
  const mediaType = entry ? imageMediaType(entry.path) : undefined;

  return entry && mediaType ? { mediaType, path: entry.path } : undefined;
}

function parseXmlAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();

  for (const match of source.matchAll(/([\w:.-]+)\s*=\s*("[^"]*"|'[^']*')/g)) {
    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) {
      continue;
    }

    attributes.set(key.toLowerCase(), decodeXmlText(rawValue.slice(1, -1)));
  }

  return attributes;
}

function getRootFilePath(containerXml: string): string | undefined {
  const match = /<rootfile\b[^>]*full-path=["']([^"']+)["'][^>]*>/i.exec(containerXml);
  return match?.[1] ? normalizeArchivePath(decodeXmlText(match[1])) : undefined;
}

function isHtmlMediaType(mediaType: string | undefined) {
  return mediaType === "application/xhtml+xml" || mediaType === "text/html";
}

function compareArchivePages(a: ArchivePageEntry, b: ArchivePageEntry) {
  return naturalPathCollator.compare(a.path, b.path);
}

function dedupePages(pages: readonly ArchivePageEntry[]): ArchivePageEntry[] {
  const seen = new Set<string>();
  const deduped: ArchivePageEntry[] = [];

  for (const page of pages) {
    if (seen.has(page.path)) {
      continue;
    }
    seen.add(page.path);
    deduped.push(page);
  }

  return deduped;
}

function decodeZipEntryName(bytes: Uint8Array, _generalPurposeBitFlag: number) {
  // CBZ and EPUB producers universally use UTF-8 encoding for entry names,
  // so we decode as UTF-8 regardless of the language encoding flag.
  return textDecoder.decode(bytes);
}

function resolveArchiveReference(baseDirectory: string, reference: string) {
  const withoutFragment = reference.split("#", 1)[0] ?? "";
  const withoutQuery = withoutFragment.split("?", 1)[0] ?? "";
  const decoded = safeDecodeUriComponent(withoutQuery);

  if (decoded.startsWith("/")) {
    return normalizeArchivePath(decoded.slice(1));
  }

  return normalizeArchivePath(posix.join(baseDirectory, decoded));
}

function normalizeArchivePath(path: string) {
  return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "").replace(/^\/+/, "");
}

function isJunkArchivePath(path: string) {
  const segments = path.split("/");
  return (
    segments.some((segment) => segment.length === 0 || segment.startsWith(".")) ||
    segments[0] === "__MACOSX"
  );
}

function decodeXmlText(value: string) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, codepoint: string) =>
      String.fromCodePoint(Number.parseInt(codepoint, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, codepoint: string) =>
      String.fromCodePoint(Number.parseInt(codepoint, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function safeDecodeUriComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readUint16(view: DataView, offset: number) {
  if (offset < 0 || offset + 2 > view.byteLength) {
    throw new Error("Unexpected end of archive");
  }

  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number) {
  if (offset < 0 || offset + 4 > view.byteLength) {
    throw new Error("Unexpected end of archive");
  }

  return view.getUint32(offset, true);
}
