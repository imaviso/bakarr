import { assertEquals, assertRejects } from "@std/assert";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime, appConfig, episodes, systemLogs } from "../../db/schema.ts";
import { encodeConfigCore } from "../system/config-codec.ts";
import { makeDefaultConfig } from "../system/defaults.ts";
import { StoredConfigCorruptError } from "../system/errors.ts";
import {
  buildMissingEpisodeRows,
  ensureEpisodes,
  findAnimeRootFolderOwner,
  getConfiguredImagesPath,
  insertAnimeAggregateAtomic,
  markSearchResultsAlreadyInLibrary,
  resolveAnimeRootFolder,
  upsertEpisode,
} from "./repository.ts";

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

Deno.test("insertAnimeAggregateAtomic rolls back anime inserts when a later write fails", async () => {
  await withTestDb(async (db) => {
    await assertRejects(() =>
      insertAnimeAggregateAtomic(db, {
        animeRow: {
          id: 77,
          malId: null,
          titleRomaji: "Rollback Show",
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
          episodeCount: 2,
          startDate: null,
          endDate: null,
          profileName: "Default",
          rootFolder: "/library/Rollback Show",
          addedAt: "2024-01-01T00:00:00.000Z",
          monitored: true,
          releaseProfileIds: "[]",
        },
        episodeRows: [
          {
            animeId: 77,
            number: 1,
            title: null,
            aired: null,
            downloaded: false,
            filePath: null,
          },
          {
            animeId: 77,
            number: 2,
            title: null,
            aired: null,
            downloaded: false,
            filePath: null,
          },
        ],
        log: {
          eventType: null as unknown as string,
          level: "success",
          message: "This should fail",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      })
    );

    const animeRows = await db.select().from(anime).where(eq(anime.id, 77));
    const episodeRows = await db.select().from(episodes).where(
      eq(episodes.animeId, 77),
    );
    const logRows = await db.select().from(systemLogs).where(
      eq(systemLogs.message, "This should fail"),
    );

    assertEquals(animeRows.length, 0);
    assertEquals(episodeRows.length, 0);
    assertEquals(logRows.length, 0);
  });
});

Deno.test("buildMissingEpisodeRows creates rows only for missing episodes", () => {
  const rows = buildMissingEpisodeRows({
    animeId: 15,
    episodeCount: 3,
    status: "RELEASING",
    startDate: undefined,
    endDate: undefined,
    resetMissingOnly: true,
    existingRows: [{
      id: 1,
      animeId: 15,
      number: 1,
      title: null,
      aired: null,
      downloaded: true,
      filePath: "/library/Show 15/Show 15 - 01.mkv",
    }],
  });

  assertEquals(rows.length, 2);
  assertEquals(rows.map((row) => row.number), [2, 3]);
});

Deno.test("resolveAnimeRootFolder can preserve an existing folder root", async () => {
  await withTestDb(async (db) => {
    const rootFolder = await resolveAnimeRootFolder(
      db,
      "/library/Naruto Fansub",
      "Naruto",
      { useExistingRoot: true },
    );

    assertEquals(rootFolder, "/library/Naruto Fansub");
  });
});

Deno.test("anime repository helpers fail explicitly on corrupt stored config", async () => {
  await withTestDb(async (db) => {
    await db.insert(appConfig).values({
      id: 1,
      data: "{not-json",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    await assertRejects(
      () => resolveAnimeRootFolder(db, "", "Naruto"),
      StoredConfigCorruptError,
      "Stored configuration is corrupt and could not be decoded",
    );
    await assertRejects(
      () => getConfiguredImagesPath(db),
      StoredConfigCorruptError,
      "Stored configuration is corrupt and could not be decoded",
    );
  });
});

Deno.test("anime repository helpers use stored config when available", async () => {
  await withTestDb(async (db) => {
    await db.insert(appConfig).values({
      id: 1,
      data: encodeConfigCore({
        ...makeDefaultConfig("./test.sqlite"),
        downloads: {
          ...makeDefaultConfig("./test.sqlite").downloads,
          create_anime_folders: false,
        },
        general: {
          ...makeDefaultConfig("./test.sqlite").general,
          images_path: "./custom-images",
        },
        library: {
          ...makeDefaultConfig("./test.sqlite").library,
          library_path: "/anime-library",
        },
      }),
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    assertEquals(
      await resolveAnimeRootFolder(db, "", "Naruto"),
      "/anime-library",
    );
    assertEquals(await getConfiguredImagesPath(db), "./custom-images");
  });
});

Deno.test("markSearchResultsAlreadyInLibrary annotates local matches", async () => {
  await withTestDb(async (db) => {
    await insertAnime(db, 20, 12);

    const results = await markSearchResultsAlreadyInLibrary(db, [
      {
        already_in_library: false,
        cover_image: undefined,
        episode_count: 12,
        format: "TV",
        id: 20,
        status: "RELEASING",
        title: { romaji: "Naruto" },
      },
      {
        already_in_library: false,
        cover_image: undefined,
        episode_count: 24,
        format: "TV",
        id: 21,
        status: "RELEASING",
        title: { romaji: "Bleach" },
      },
    ]);

    assertEquals(results[0]?.already_in_library, true);
    assertEquals(results[1]?.already_in_library, false);
  });
});

Deno.test("findAnimeRootFolderOwner returns the mapped anime for a root", async () => {
  await withTestDb(async (db) => {
    await insertAnime(db, 20, 12);

    const owner = await findAnimeRootFolderOwner(db, "/library/Show-20");
    assertEquals(owner?.id, 20);
    assertEquals(owner?.titleRomaji, "Show 20");
  });
});

Deno.test("findAnimeRootFolderOwner handles trailing slash parents", async () => {
  await withTestDb(async (db) => {
    await insertAnimeWithRoot(db, 21, 12, "/library/Naruto/");

    const owner = await findAnimeRootFolderOwner(
      db,
      "/library/Naruto/Season 1",
    );

    assertEquals(owner?.id, 21);
  });
});

Deno.test("anime root-folder triggers reject overlapping roots", async () => {
  await withTestDb(async (db) => {
    await insertAnimeWithRoot(db, 30, 12, "/library/Naruto/");

    await assertRejects(() =>
      insertAnimeWithRoot(db, 31, 12, "/library/Naruto/Season 1")
    );
  });
});

async function insertAnime(
  db: AppDatabase,
  id: number,
  episodeCount: number,
) {
  await insertAnimeWithRoot(db, id, episodeCount, `/library/Show-${id}`);
}

async function insertAnimeWithRoot(
  db: AppDatabase,
  id: number,
  episodeCount: number,
  rootFolder: string,
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
    rootFolder,
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
