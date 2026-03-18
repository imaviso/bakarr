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
  StoredConfigCorruptError,
  StoredConfigMissingError,
} from "../system/errors.ts";
import {
  currentImportMode,
  currentNamingSettings,
  decodeDownloadSourceMetadata,
  encodeDownloadSourceMetadata,
  getConfigLibraryPath,
  loadCurrentEpisodeState,
  loadDownloadEventPresentationContexts,
  loadDownloadPresentationContexts,
  loadQualityProfile,
  loadReleaseRules,
  loadRuntimeConfig,
  requireAnime,
} from "./repository.ts";
import { OperationsAnimeNotFoundError } from "./errors.ts";

Deno.test("operations repository helpers load runtime config and config-backed library settings", async () => {
  await withTestDb(async (db, databaseFile) => {
    const defaults = makeDefaultConfig(databaseFile);

    await db.insert(appConfig).values({
      id: 1,
      data: encodeConfigCore({
        ...defaults,
        library: {
          ...defaults.library,
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

    const namingSettings = await currentNamingSettings(db);
    assertEquals(namingSettings.namingFormat, defaults.library.naming_format);
    assertEquals(
      namingSettings.movieNamingFormat,
      defaults.library.movie_naming_format,
    );
    assertEquals(
      namingSettings.preferredTitle,
      defaults.library.preferred_title,
    );

    const storedProfile = await loadQualityProfile(db, "Default");
    assertNotEquals(storedProfile, null);
    assertEquals(storedProfile!.max_size, "4GB");

    const fallbackProfile = await loadQualityProfile(db, "Missing");
    assertEquals(fallbackProfile, null);
  });
});

Deno.test("operations repository helpers fall back only on missing config rows", async () => {
  await withTestDb(async (db, _databaseFile) => {
    assertEquals(await getConfigLibraryPath(db), "./library");
    assertEquals(await currentImportMode(db), "copy");
    await assertRejects(
      () => loadRuntimeConfig(db),
      StoredConfigMissingError,
      "Stored configuration is missing",
    );

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

    await db.insert(appConfig).values({
      id: 1,
      data: "{not-json",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    await assertRejects(
      () => getConfigLibraryPath(db),
      StoredConfigCorruptError,
      "Stored library config is corrupt and could not be decoded",
    );
    await assertRejects(
      () => currentImportMode(db),
      StoredConfigCorruptError,
      "Stored library config is corrupt and could not be decoded",
    );
    await assertRejects(
      () => loadRuntimeConfig(db),
      StoredConfigCorruptError,
      "Stored configuration is corrupt and could not be decoded",
    );
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
    assertEquals(await currentNamingSettings(db), {
      movieNamingFormat: defaults.library.movie_naming_format,
      namingFormat: defaults.library.naming_format,
      preferredTitle: defaults.library.preferred_title,
    });
  });
});

Deno.test("operations repository helpers backfill missing scheduler metadata refresh fields", async () => {
  await withTestDb(async (db, _databaseFile) => {
    await db.insert(qualityProfiles).values(
      encodeQualityProfileRow({
        allowed_qualities: ["1080p"],
        cutoff: "1080p",
        max_size: null,
        min_size: null,
        name: "Default",
        seadex_preferred: true,
        upgrade_allowed: true,
      }),
    );

    await db.insert(appConfig).values({
      id: 1,
      data: JSON.stringify({
        downloads: {
          create_anime_folders: true,
          delete_download_files_after_import: false,
          max_size_gb: 8,
          prefer_dual_audio: false,
          preferred_codec: null,
          preferred_groups: [],
          reconcile_completed_downloads: true,
          remote_path_mappings: [],
          remove_torrent_on_import: true,
          root_path: "./downloads",
          use_seadex: true,
        },
        general: {
          database_path: "./bakarr.sqlite",
          images_path: "./data/images",
          log_level: "info",
          max_db_connections: 4,
          min_db_connections: 1,
          suppress_connection_errors: true,
          worker_threads: 4,
        },
        library: {
          library_path: "/custom-library",
        },
        nyaa: {
          base_url: "https://nyaa.si",
          default_category: "1_2",
          filter_remakes: true,
          min_seeders: 1,
          preferred_resolution: "1080p",
        },
        qbittorrent: {
          default_category: "anime",
          enabled: false,
          password: null,
          url: "http://localhost:8080",
          username: "admin",
        },
        scheduler: {
          check_delay_seconds: 5,
          check_interval_minutes: 30,
          cron_expression: null,
          enabled: true,
          max_concurrent_checks: 2,
        },
      }),
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    const runtimeConfig = await loadRuntimeConfig(db);

    assertEquals(runtimeConfig.library.library_path, "/custom-library");
    assertEquals(runtimeConfig.scheduler.metadata_refresh_hours, 24);
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
      startYear: null,
      endYear: null,
      nextAiringAt: null,
      nextAiringEpisode: null,
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

Deno.test("operations repository helpers encode and decode download provenance", () => {
  const encoded = encodeDownloadSourceMetadata({
    chosen_from_seadex: true,
    decision_reason: "Accepted (WEB-DL 1080p, score 12)",
    group: "SubsPlease",
    parsed_title: "[SubsPlease] Naruto - 01 (1080p)",
    previous_quality: "WEB-DL 720p",
    previous_score: 7,
    resolution: "1080p",
    selection_kind: "upgrade",
    selection_score: 12,
    source_identity: {
      episode_numbers: [1],
      label: "01",
      scheme: "absolute",
    },
  });

  assertEquals(decodeDownloadSourceMetadata(encoded), {
    chosen_from_seadex: true,
    decision_reason: "Accepted (WEB-DL 1080p, score 12)",
    group: "SubsPlease",
    parsed_title: "[SubsPlease] Naruto - 01 (1080p)",
    previous_quality: "WEB-DL 720p",
    previous_score: 7,
    resolution: "1080p",
    selection_kind: "upgrade",
    selection_score: 12,
    source_identity: {
      episode_numbers: [1],
      label: "01",
      scheme: "absolute",
    },
  });
});

Deno.test("operations repository helpers load download presentation contexts", async () => {
  await withTestDb(async (db, _databaseFile) => {
    await db.insert(anime).values({
      addedAt: "2024-01-01T00:00:00.000Z",
      bannerImage: null,
      coverImage: "https://example.com/naruto.jpg",
      description: null,
      endDate: null,
      endYear: null,
      episodeCount: 12,
      format: "TV",
      genres: "[]",
      id: 20,
      malId: null,
      monitored: true,
      nextAiringAt: null,
      nextAiringEpisode: null,
      profileName: "Default",
      releaseProfileIds: encodeNumberList([]),
      rootFolder: "/library/Naruto",
      score: null,
      startDate: null,
      startYear: null,
      status: "RELEASING",
      studios: "[]",
      titleEnglish: "Naruto",
      titleNative: null,
      titleRomaji: "Naruto",
    });
    await db.insert(episodes).values({
      aired: null,
      animeId: 20,
      downloaded: true,
      filePath: "/library/Naruto/Naruto - 01.mkv",
      number: 1,
      title: null,
    });
    const [row] = await db.insert(schema.downloads).values({
      addedAt: "2024-01-01T00:00:00.000Z",
      animeId: 20,
      animeTitle: "Naruto",
      contentPath: "/downloads/Naruto - 01.mkv",
      coveredEpisodes: "[1]",
      downloadDate: null,
      downloadedBytes: 0,
      episodeNumber: 1,
      errorMessage: null,
      etaSeconds: null,
      externalState: "imported",
      groupName: null,
      infoHash: null,
      isBatch: false,
      lastErrorAt: null,
      lastSyncedAt: null,
      magnet: null,
      progress: 100,
      reconciledAt: "2024-01-01T00:10:00.000Z",
      retryCount: 0,
      savePath: "/downloads",
      sourceMetadata: null,
      speedBytes: 0,
      status: "imported",
      torrentName: "Naruto - 01",
      totalBytes: 0,
    }).returning();

    const contexts = await loadDownloadPresentationContexts(db, [row]);

    assertEquals(contexts.get(row.id), {
      animeImage: "https://example.com/naruto.jpg",
      importedPath: "/library/Naruto/Naruto - 01.mkv",
    });
  });
});

Deno.test("operations repository helpers chunk large download event context lookups", async () => {
  await withTestDb(async (db, _databaseFile) => {
    await db.insert(anime).values({
      addedAt: "2024-01-01T00:00:00.000Z",
      bannerImage: null,
      coverImage: "https://example.com/naruto.jpg",
      description: null,
      endDate: null,
      endYear: null,
      episodeCount: 12,
      format: "TV",
      genres: "[]",
      id: 20,
      malId: null,
      monitored: true,
      nextAiringAt: null,
      nextAiringEpisode: null,
      profileName: "Default",
      releaseProfileIds: encodeNumberList([]),
      rootFolder: "/library/Naruto",
      score: null,
      startDate: null,
      startYear: null,
      status: "RELEASING",
      studios: "[]",
      titleEnglish: "Naruto",
      titleNative: null,
      titleRomaji: "Naruto",
    });

    const insertedDownloads = await db.insert(schema.downloads).values(
      Array.from({ length: 1_005 }, (_, index) => ({
        addedAt: "2024-01-01T00:00:00.000Z",
        animeId: 20,
        animeTitle: `Naruto ${index + 1}`,
        contentPath: null,
        coveredEpisodes: null,
        downloadDate: null,
        downloadedBytes: 0,
        episodeNumber: index + 1,
        errorMessage: null,
        etaSeconds: null,
        externalState: "queued",
        groupName: null,
        infoHash: `hash-${index + 1}`,
        isBatch: false,
        lastErrorAt: null,
        lastSyncedAt: null,
        magnet: null,
        progress: 0,
        reconciledAt: null,
        retryCount: 0,
        savePath: "/downloads",
        sourceMetadata: null,
        speedBytes: 0,
        status: "queued",
        torrentName: `Naruto - ${index + 1}`,
        totalBytes: 0,
      })),
    ).returning();

    const eventRows = insertedDownloads.map((row, index) => ({
      animeId: 20,
      createdAt: `2024-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
      downloadId: row.id,
      eventType: "download.queued",
      fromStatus: null,
      id: index + 1,
      message: `Queued Naruto - ${index + 1}`,
      metadata: null,
      toStatus: "queued",
    } satisfies typeof schema.downloadEvents.$inferSelect));

    const contexts = await loadDownloadEventPresentationContexts(db, eventRows);

    assertEquals(contexts.size, 1_005);
    assertEquals(contexts.get(eventRows[1_004]!.id), {
      animeImage: "https://example.com/naruto.jpg",
      animeTitle: "Naruto",
      torrentName: "Naruto - 1005",
    });
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
