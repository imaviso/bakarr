import { assertEquals, assertRejects } from "@std/assert";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime, episodes } from "../../db/schema.ts";
import { ensureEpisodes, upsertEpisode } from "./repository.ts";

Deno.test("upsertEpisode prevents duplicate anime episode rows", async () => {
  await withTestDb(async (db) => {
    await insertAnime(db, 1, 12);

    await upsertEpisode(db, 1, 1, {
      downloaded: true,
      filePath: "/library/Test Show/Test Show - 01.mkv",
      title: "Episode 1",
    });
    await upsertEpisode(db, 1, 1, {
      downloaded: false,
      title: "Episode 1 updated",
    });

    const rows = await db.select().from(episodes).where(
      eq(episodes.animeId, 1),
    );
    assertEquals(rows.length, 1);
    assertEquals(rows[0]?.number, 1);
    assertEquals(rows[0]?.title, "Episode 1 updated");
  });
});

Deno.test("ensureEpisodes rejects duplicate episode inserts for same anime", async () => {
  await withTestDb(async (db) => {
    await insertAnime(db, 2, 1);
    await db.insert(episodes).values({
      animeId: 2,
      number: 1,
      title: null,
      aired: null,
      downloaded: false,
      filePath: null,
    });

    await ensureEpisodes(
      db,
      2,
      1,
      "RELEASING",
      undefined,
      undefined,
      false,
    );

    await assertRejects(() =>
      db.insert(episodes).values({
        animeId: 2,
        number: 1,
        title: null,
        aired: null,
        downloaded: false,
        filePath: null,
      })
    );
  });
});

async function insertAnime(
  db: AppDatabase,
  id: number,
  episodeCount: number,
) {
  await db.insert(anime).values({
    id,
    malId: null,
    titleRomaji: `Show ${id}`,
    titleEnglish: null,
    titleNative: null,
    format: "TV",
    description: null,
    score: null,
    genres: "[]",
    studios: "[]",
    coverImage: null,
    bannerImage: null,
    status: "RELEASING",
    episodeCount,
    startDate: null,
    endDate: null,
    profileName: "Default",
    rootFolder: `/library/Show-${id}`,
    addedAt: "2024-01-01T00:00:00.000Z",
    monitored: true,
    releaseProfileIds: "[]",
  });
}

async function withTestDb(run: (db: AppDatabase) => Promise<void>) {
  const databaseFile = await Deno.makeTempFile({ suffix: ".sqlite" });
  const client = createClient({ url: `file:${databaseFile}` });
  const db = drizzle({ client, schema });

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await run(db);
  } finally {
    client.close();
    await Deno.remove(databaseFile).catch(() => undefined);
  }
}
