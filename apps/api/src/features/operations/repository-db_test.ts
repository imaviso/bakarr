import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import {
  anime,
  appConfig,
  episodes,
  qualityProfiles,
  releaseProfiles,
} from "../../db/schema.ts";
import {
  encodeConfigCore,
  encodeNumberList,
  encodeQualityProfileRow,
  encodeReleaseProfileRules,
} from "../system/config-codec.ts";
import { makeDefaultConfig } from "../system/defaults.ts";
import {
  currentImportMode,
  getConfigLibraryPath,
  loadCurrentEpisodeState,
  loadQualityProfile,
  loadReleaseRules,
  loadRuntimeConfig,
  requireAnime,
} from "./repository.ts";
import { OperationsAnimeNotFoundError } from "./errors.ts";

Deno.test("operations repository helpers load runtime config and fallback values", async () => {
  await withTestDb(async (db, databaseFile) => {
    await db.insert(appConfig).values({
      id: 1,
      data: encodeConfigCore({
        ...makeDefaultConfig(databaseFile),
        library: {
          ...makeDefaultConfig(databaseFile).library,
          import_mode: "move",
          library_path: "/anime-library",
        },
      }),
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    await db.insert(qualityProfiles).values(
      encodeQualityProfileRow({
        allowed_qualities: ["1080p", "720p"],
        cutoff: "1080p",
        max_size: "4GB",
        min_size: null,
        name: "Default",
        seadex_preferred: true,
        upgrade_allowed: true,
      }),
    );

    const runtimeConfig = await loadRuntimeConfig(db);
    assertEquals(runtimeConfig.library.library_path, "/anime-library");
    assertEquals(runtimeConfig.library.import_mode, "move");
    assertEquals(runtimeConfig.profiles.length, 1);
    assertEquals(runtimeConfig.profiles[0].name, "Default");

    assertEquals(await getConfigLibraryPath(db), "/anime-library");
    assertEquals(await currentImportMode(db), "move");

    const storedProfile = await loadQualityProfile(db, "Default");
    assertNotEquals(storedProfile, null);
    assertEquals(storedProfile!.max_size, "4GB");

    const fallbackProfile = await loadQualityProfile(db, "Missing");
    assertEquals(fallbackProfile, null);
  });
});

Deno.test("operations repository helpers fall back on missing or invalid config rows", async () => {
  await withTestDb(async (db, _databaseFile) => {
    assertEquals(await getConfigLibraryPath(db), "./library");
    assertEquals(await currentImportMode(db), "copy");

    await db.insert(appConfig).values({
      id: 1,
      data: "{not-json",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    assertEquals(await getConfigLibraryPath(db), "./library");
    assertEquals(await currentImportMode(db), "copy");
  });
});

Deno.test("operations repository helpers prefer schema-backed defaults for partial config rows", async () => {
  await withTestDb(async (db, databaseFile) => {
    const defaults = makeDefaultConfig(databaseFile);

    await db.insert(appConfig).values({
      id: 1,
      data: JSON.stringify({
        ...defaults,
        library: {
          library_path: "/custom-library",
        },
      }),
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    assertEquals(await getConfigLibraryPath(db), "/custom-library");
    assertEquals(await currentImportMode(db), "copy");
  });
});

Deno.test("operations repository helpers load anime release rules and episode state", async () => {
  await withTestDb(async (db, _databaseFile) => {
    await db.insert(anime).values({
      id: 20,
      malId: null,
      titleRomaji: "Naruto",
      titleEnglish: "Naruto",
      titleNative: null,
      format: "TV",
      description: null,
      score: null,
      genres: "[]",
      studios: "[]",
      coverImage: null,
      bannerImage: null,
      status: "RELEASING",
      episodeCount: 12,
      startDate: null,
      endDate: null,
      profileName: "Default",
      rootFolder: "/library/Naruto",
      addedAt: "2024-01-01T00:00:00.000Z",
      monitored: true,
      releaseProfileIds: encodeNumberList([2]),
    });
    await db.insert(releaseProfiles).values([
      {
        id: 1,
        name: "Global",
        enabled: true,
        isGlobal: true,
        rules: encodeReleaseProfileRules([
          { rule_type: "preferred", score: 10, term: "SubsPlease" },
        ]),
      },
      {
        id: 2,
        name: "Assigned",
        enabled: true,
        isGlobal: false,
        rules: encodeReleaseProfileRules([
          { rule_type: "must", score: 0, term: "1080p" },
        ]),
      },
      {
        id: 3,
        name: "Ignored",
        enabled: true,
        isGlobal: false,
        rules: encodeReleaseProfileRules([
          { rule_type: "must_not", score: 0, term: "Dub" },
        ]),
      },
    ]);
    await db.insert(episodes).values({
      animeId: 20,
      number: 1,
      title: null,
      aired: null,
      downloaded: true,
      filePath: "/library/Naruto/Naruto - 01.mkv",
    });

    const animeRow = await requireAnime(db, 20);
    assertEquals(animeRow.titleRomaji, "Naruto");

    const releaseRules = await loadReleaseRules(db, animeRow);
    assertEquals(releaseRules, [
      { rule_type: "preferred", score: 10, term: "SubsPlease" },
      { rule_type: "must", score: 0, term: "1080p" },
    ]);

    const episodeState = await loadCurrentEpisodeState(db, 20, 1);
    assertEquals(episodeState, {
      downloaded: true,
      filePath: "/library/Naruto/Naruto - 01.mkv",
    });
    assertEquals(await loadCurrentEpisodeState(db, 20, 2), null);

    await assertRejects(
      () => requireAnime(db, 999),
      OperationsAnimeNotFoundError,
      "Anime not found",
    );
  });
});

async function withTestDb(
  run: (db: AppDatabase, databaseFile: string) => Promise<void>,
) {
  const databaseFile = await Deno.makeTempFile({ suffix: ".sqlite" });
  const client = createClient({ url: `file:${databaseFile}` });
  const db = drizzle({ client, schema });

  try {
    await migrate(db, { migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER });
    await run(db, databaseFile);
  } finally {
    client.close();
    await Deno.remove(databaseFile).catch(() => undefined);
  }
}
