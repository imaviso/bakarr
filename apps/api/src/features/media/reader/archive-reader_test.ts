import { TextEncoder } from "node:util";
import { deflateRawSync } from "node:zlib";
import { Effect } from "effect";
import { assert, it } from "@effect/vitest";

import {
  findZipEntry,
  listArchiveImagePages,
  parseZipArchive,
  readZipEntryBytes,
} from "@/features/media/reader/archive-reader.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

it.effect("lists and reads image pages from a cbz archive", () =>
  Effect.gen(function* () {
    const archiveBytes = makeStoredZip([
      { path: "chapter/page10.jpg", text: "ten" },
      { path: "chapter/page2.png", text: "two" },
      { path: "chapter/notes.txt", text: "ignore" },
      { path: "__MACOSX/page1.jpg", text: "junk" },
    ]);

    const archive = yield* parseZipArchive(archiveBytes, "test.cbz");
    const pages = listArchiveImagePages(archive, "zip");

    assert.deepStrictEqual(
      pages.map((page) => page.path),
      ["chapter/page2.png", "chapter/page10.jpg"],
    );

    const entry = findZipEntry(archive, pages[0]!.path);
    assert.notStrictEqual(entry, undefined);

    if (entry) {
      const bytes = yield* readZipEntryBytes(archive, entry);
      assert.deepStrictEqual(textDecoder.decode(bytes), "two");
    }
  }),
);

it.effect("reads deflated zip entries with correct decompression", () =>
  Effect.gen(function* () {
    const archiveBytes = makeDeflatedZip([{ path: "cover.jpg", text: "deflated-cover" }]);

    const archive = yield* parseZipArchive(archiveBytes, "deflated.cbz");
    const entry = findZipEntry(archive, "cover.jpg");
    assert.notStrictEqual(entry, undefined);
    assert.deepStrictEqual(entry?.compressionMethod, 8);

    if (entry) {
      const bytes = yield* readZipEntryBytes(archive, entry);
      assert.deepStrictEqual(textDecoder.decode(bytes), "deflated-cover");
    }
  }),
);

it.effect("orders epub image pages by cover and spine document references", () =>
  Effect.gen(function* () {
    const archiveBytes = makeStoredZip([
      {
        path: "META-INF/container.xml",
        text: `<container><rootfiles><rootfile full-path="OPS/package.opf" /></rootfiles></container>`,
      },
      {
        path: "OPS/package.opf",
        text: `
          <package>
            <manifest>
              <item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image" />
              <item id="chapter-1" href="text/chapter1.xhtml" media-type="application/xhtml+xml" />
              <item id="chapter-2" href="text/chapter2.xhtml" media-type="application/xhtml+xml" />
            </manifest>
            <spine>
              <itemref idref="chapter-2" />
              <itemref idref="chapter-1" />
            </spine>
          </package>`,
      },
      {
        path: "OPS/text/chapter1.xhtml",
        text: `<html><body><img src="../images/page1.png" /></body></html>`,
      },
      {
        path: "OPS/text/chapter2.xhtml",
        text: `<html><body><svg><image href="../images/page2.webp" /></svg></body></html>`,
      },
      { path: "OPS/images/cover.jpg", text: "cover" },
      { path: "OPS/images/page1.png", text: "one" },
      { path: "OPS/images/page2.webp", text: "two" },
    ]);

    const archive = yield* parseZipArchive(archiveBytes, "book.epub");
    const pages = listArchiveImagePages(archive, "epub");

    assert.deepStrictEqual(
      pages.map((page) => page.path),
      ["OPS/images/cover.jpg", "OPS/images/page2.webp", "OPS/images/page1.png"],
    );
  }),
);

interface StoredZipEntry {
  readonly path: string;
  readonly text: string;
}

function makeStoredZip(entries: readonly StoredZipEntry[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(textEncoder.encode(entry.path));
    const dataBytes = Buffer.from(textEncoder.encode(entry.text));
    const local = Buffer.alloc(30 + nameBytes.length + dataBytes.length);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(1 << 11, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(dataBytes.length, 18);
    local.writeUInt32LE(dataBytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    dataBytes.copy(local, 30 + nameBytes.length);
    locals.push(local);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(1 << 11, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(dataBytes.length, 20);
    central.writeUInt32LE(dataBytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);

  return Uint8Array.from(Buffer.concat([...locals, centralDirectory, end]));
}

function makeDeflatedZip(entries: readonly StoredZipEntry[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(textEncoder.encode(entry.path));
    const rawBytes = Buffer.from(textEncoder.encode(entry.text));
    const deflated = deflateRawSync(rawBytes);
    const local = Buffer.alloc(30 + nameBytes.length + deflated.length);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(1 << 11, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(rawBytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    deflated.copy(local, 30 + nameBytes.length);
    locals.push(local);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(1 << 11, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(rawBytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);

  return Uint8Array.from(Buffer.concat([...locals, centralDirectory, end]));
}
