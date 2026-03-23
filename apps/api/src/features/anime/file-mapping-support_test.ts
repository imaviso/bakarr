import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import * as schema from "../../db/schema.ts";
import { withSqliteTestDb } from "../../test/database-test.ts";
import {
  withFileSystemSandbox,
  writeTextFile,
} from "../../test/filesystem-test.ts";
import { resolveEpisodeFileEffect } from "./file-mapping-support.ts";

async function withTestDb(run: (db: AppDatabase) => Promise<void>) {
  await withSqliteTestDb({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) => run(db as AppDatabase),
    schema,
  });
}

async function insertAnime(db: AppDatabase, rootFolder: string) {
  await db.insert(schema.anime).values({
    addedAt: "2024-01-01T00:00:00Z",
    format: "TV",
    genres: "[]",
    id: 1,
    monitored: true,
    profileName: "Default",
    releaseProfileIds: "[]",
    rootFolder,
    status: "RELEASING",
    studios: "[]",
    titleRomaji: "Test Show",
  });
}

Deno.test("resolveEpisodeFileEffect returns resolved file when mapping is valid", async () => {
  await withTestDb(async (db) => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      const filePath = `${root}/Episode 1.mkv`;
      await Effect.runPromise(writeTextFile(fs, filePath, "video"));
      await insertAnime(db, root);
      await db.insert(schema.episodes).values({
        animeId: 1,
        downloaded: true,
        filePath,
        number: 1,
      });

      const result = await Effect.runPromise(
        resolveEpisodeFileEffect({ animeId: 1, db, episodeNumber: 1, fs }),
      );

      assertEquals(result._tag, "EpisodeFileResolved");
      if (result._tag === "EpisodeFileResolved") {
        assertEquals(result.fileName, "Episode 1.mkv");
        assertEquals(result.filePath, filePath);
      }
    });
  });
});

Deno.test("resolveEpisodeFileEffect returns unmapped state when no file path is stored", async () => {
  await withTestDb(async (db) => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      await insertAnime(db, root);
      await db.insert(schema.episodes).values({
        animeId: 1,
        downloaded: false,
        filePath: null,
        number: 1,
      });

      const result = await Effect.runPromise(
        resolveEpisodeFileEffect({ animeId: 1, db, episodeNumber: 1, fs }),
      );

      assertEquals(result._tag, "EpisodeFileUnmapped");
    });
  });
});

Deno.test("resolveEpisodeFileEffect returns missing state when mapped file is inaccessible", async () => {
  await withTestDb(async (db) => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      const filePath = `${root}/Missing Episode.mkv`;
      await insertAnime(db, root);
      await db.insert(schema.episodes).values({
        animeId: 1,
        downloaded: true,
        filePath,
        number: 1,
      });

      const result = await Effect.runPromise(
        resolveEpisodeFileEffect({ animeId: 1, db, episodeNumber: 1, fs }),
      );

      assertEquals(result._tag, "EpisodeFileMissing");
    });
  });
});

Deno.test("resolveEpisodeFileEffect returns root inaccessible state when anime root is inaccessible", async () => {
  await withTestDb(async (db) => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      const filePath = `${root}/Episode 1.mkv`;
      await Effect.runPromise(writeTextFile(fs, filePath, "video"));
      await insertAnime(db, `${root}/missing-root`);
      await db.insert(schema.episodes).values({
        animeId: 1,
        downloaded: true,
        filePath,
        number: 1,
      });

      const result = await Effect.runPromise(
        resolveEpisodeFileEffect({ animeId: 1, db, episodeNumber: 1, fs }),
      );

      assertEquals(result._tag, "EpisodeFileRootInaccessible");
    });
  });
});

Deno.test("resolveEpisodeFileEffect returns outside-root state when mapping escapes anime root", async () => {
  await withTestDb(async (db) => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      const animeRoot = `${root}/anime`;
      const externalRoot = `${root}/external`;
      const filePath = `${externalRoot}/Episode 1.mkv`;

      await Effect.runPromise(fs.mkdir(animeRoot, { recursive: true }));
      await Effect.runPromise(fs.mkdir(externalRoot, { recursive: true }));
      await Effect.runPromise(writeTextFile(fs, filePath, "video"));

      await insertAnime(db, animeRoot);
      await db.insert(schema.episodes).values({
        animeId: 1,
        downloaded: true,
        filePath,
        number: 1,
      });

      const result = await Effect.runPromise(
        resolveEpisodeFileEffect({ animeId: 1, db, episodeNumber: 1, fs }),
      );

      assertEquals(result._tag, "EpisodeFileOutsideRoot");
    });
  });
});
