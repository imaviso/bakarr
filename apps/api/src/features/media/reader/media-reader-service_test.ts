import { CommandExecutor } from "@effect/platform";
import { dirname } from "node:path";
import { TextEncoder } from "node:util";
import { Effect, Layer } from "effect";
import { assert, it } from "@effect/vitest";

import type { AppDatabase } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { AppConfig } from "@/config/schema.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import {
  MediaReaderService,
  MediaReaderServiceLive,
} from "@/features/media/reader/media-reader-service.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { makeTestFileSystemEffect } from "@/test/filesystem-test.ts";
import { makeCommandExecutorStub, makeDatabaseServiceStub } from "@/test/stubs.ts";
import {
  makeMediaReadRepository,
  MediaReadRepository,
} from "@/features/media/shared/media-read-repository.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

it.scoped("MediaReaderService exposes cbz archive pages and image bytes", () =>
  withSqliteTestDbEffect({
    schema,
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const fs = yield* makeTestFileSystemEffect();
        const libraryRoot = `${dirname(databaseFile)}/library`;
        const filePath = `${libraryRoot}/Volume 1.cbz`;

        yield* fs.mkdir(libraryRoot, { recursive: true });
        yield* fs.writeFile(
          filePath,
          makeStoredZip([
            { path: "page1.jpg", text: "page-one" },
            { path: "page2.png", text: "page-two" },
          ]),
        );
        yield* seedMediaUnit(appDb, libraryRoot, filePath);

        const readerLayer = MediaReaderServiceLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(AppConfig, {
                appVersion: "0.1.0",
                databaseFile,
                port: 8000,
                sessionCookieName: "bakarr_session",
                sessionCookieSecure: true,
                sessionDurationDays: 30,
              }),
              Layer.succeed(
                CommandExecutor.CommandExecutor,
                makeCommandExecutorStub(() => Effect.succeed("")),
              ),
              Layer.succeed(Database, makeDatabaseServiceStub(appDb)),
              Layer.succeed(MediaReadRepository, makeMediaReadRepository(appDb)),
              Layer.succeed(FileSystem, fs),
            ),
          ),
        );

        const result = yield* Effect.gen(function* () {
          const reader = yield* MediaReaderService;
          const pages = yield* reader.listPages(1, 1);
          const image = yield* reader.readPageImage(1, 1, 2);

          return { image, pages };
        }).pipe(Effect.provide(readerLayer));

        assert.deepStrictEqual(
          result.pages.pages.map((page) => page.url),
          ["/api/media/1/units/1/pages/1/image", "/api/media/1/units/1/pages/2/image"],
        );
        assert.deepStrictEqual(result.pages.pages[1]?.media_type, "image/png");
        assert.deepStrictEqual(result.image.mediaType, "image/png");
        assert.deepStrictEqual(textDecoder.decode(result.image.bytes), "page-two");
      }),
  }),
);

function seedMediaUnit(db: AppDatabase, rootFolder: string, filePath: string) {
  return Effect.tryPromise(async () => {
    await db.insert(schema.media).values({
      addedAt: "2024-01-01T00:00:00Z",
      format: "MANGA",
      genres: "[]",
      id: 1,
      mediaKind: "manga",
      monitored: true,
      profileName: "Default",
      releaseProfileIds: "[]",
      rootFolder,
      status: "FINISHED",
      studios: "[]",
      titleRomaji: "Test Manga",
    });
    await db.insert(schema.mediaUnits).values({
      downloaded: true,
      filePath,
      mediaId: 1,
      number: 1,
    });
  });
}

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
