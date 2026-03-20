import { assertEquals } from "@std/assert";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { upsertEpisodeFilesAtomic } from "./download-support.ts";
import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";

Deno.test("upsertEpisodeFilesAtomic inserts multiple episodes atomically", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
      id: 1,
      titleRomaji: "Test Show",
      rootFolder: "/test",
      format: "TV",
      status: "FINISHED",
      genres: "[]",
      studios: "[]",
      profileName: "Default",
      releaseProfileIds: "[]",
      addedAt: "2024-01-01T00:00:00Z",
      monitored: true,
    });

    await Effect.runPromise(
      upsertEpisodeFilesAtomic(db, 1, [1, 2, 3], "/test/episode.mkv"),
    );

    const rows = await db.select().from(schema.episodes).where(
      eq(schema.episodes.animeId, 1),
    );
    assertEquals(rows.length, 3);

    const numbers = rows.map((r) => r.number).sort((a, b) => a - b);
    assertEquals(numbers, [1, 2, 3]);

    assertEquals(rows[0].downloaded, true);
    assertEquals(rows[0].filePath, "/test/episode.mkv");
  });
});

Deno.test("upsertEpisodeFilesAtomic updates existing episodes", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
      id: 1,
      titleRomaji: "Test Show",
      rootFolder: "/test",
      format: "TV",
      status: "FINISHED",
      genres: "[]",
      studios: "[]",
      profileName: "Default",
      releaseProfileIds: "[]",
      addedAt: "2024-01-01T00:00:00Z",
      monitored: true,
    });

    await db.insert(schema.episodes).values([
      { animeId: 1, number: 1, downloaded: false, filePath: null },
      { animeId: 1, number: 2, downloaded: true, filePath: "/old.mkv" },
    ]);

    await Effect.runPromise(
      upsertEpisodeFilesAtomic(db, 1, [1, 2], "/new.mkv"),
    );

    const rows = await db.select().from(schema.episodes).where(
      eq(schema.episodes.animeId, 1),
    ).orderBy(schema.episodes.number);

    assertEquals(rows.length, 2);
    assertEquals(rows[0].downloaded, true);
    assertEquals(rows[0].filePath, "/new.mkv");
    assertEquals(rows[1].downloaded, true);
    assertEquals(rows[1].filePath, "/new.mkv");
  });
});

Deno.test("upsertEpisodeFilesAtomic handles empty episode list", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
      id: 1,
      titleRomaji: "Test Show",
      rootFolder: "/test",
      format: "TV",
      status: "FINISHED",
      genres: "[]",
      studios: "[]",
      profileName: "Default",
      releaseProfileIds: "[]",
      addedAt: "2024-01-01T00:00:00Z",
      monitored: true,
    });

    await Effect.runPromise(
      upsertEpisodeFilesAtomic(db, 1, [], "/test/episode.mkv"),
    );

    const rows = await db.select().from(schema.episodes);
    assertEquals(rows.length, 0);
  });
});

async function withTestDb(run: (db: AppDatabase) => Promise<void>) {
  const databaseFile = await Deno.makeTempFile({ suffix: ".sqlite" });
  const client = createClient({ url: `file:${databaseFile}` });
  const db = drizzle({ client, schema });

  try {
    await migrate(db, { migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER });
    await run(db);
  } finally {
    client.close();
    await Deno.remove(databaseFile).catch(() => undefined);
  }
}
