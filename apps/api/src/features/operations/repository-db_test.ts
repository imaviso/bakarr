import { assertEquals, assertNotEquals, it } from "../../test/vitest.ts";
import { Cause, Effect } from "effect";

import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import { withSqliteTestDbEffect } from "../../test/database-test.ts";
import { anime, appConfig, episodes, qualityProfiles, releaseProfiles } from "../../db/schema.ts";
import {
  encodeConfigCore,
  encodeNumberList,
  encodeQualityProfileRow,
  encodeReleaseProfileRules,
} from "../system/config-codec.ts";
import { makeDefaultConfig } from "../system/defaults.ts";
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

it.scoped(
  "operations repository helpers load runtime config and config-backed library settings",
  () =>
    withTestDbEffect((db, databaseFile) =>
      Effect.gen(function* () {
        const defaults = makeDefaultConfig(databaseFile);

        yield* Effect.promise(() =>
          db.insert(appConfig).values({
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
          }),
        );
        yield* Effect.promise(() =>
          db.insert(qualityProfiles).values(
            encodeQualityProfileRow({
              allowed_qualities: ["1080p", "720p"],
              cutoff: "1080p",
              max_size: "4GB",
              min_size: null,
              name: "Default",
              seadex_preferred: true,
              upgrade_allowed: true,
            }),
          ),
        );

        const runtimeConfig = yield* loadRuntimeConfig(db);
        assertEquals(runtimeConfig.library.library_path, "/anime-library");
        assertEquals(runtimeConfig.library.import_mode, "move");
        assertEquals(runtimeConfig.profiles.length, 1);
        assertEquals(runtimeConfig.profiles[0].name, "Default");

        assertEquals(yield* getConfigLibraryPath(db), "/anime-library");
        assertEquals(yield* currentImportMode(db), "move");

        const namingSettings = yield* currentNamingSettings(db);
        assertEquals(namingSettings.namingFormat, defaults.library.naming_format);
        assertEquals(namingSettings.movieNamingFormat, defaults.library.movie_naming_format);
        assertEquals(namingSettings.preferredTitle, defaults.library.preferred_title);

        const storedProfile = yield* loadQualityProfile(db, "Default");
        assertNotEquals(storedProfile, null);
        assertEquals(storedProfile!.max_size, "4GB");

        const fallbackProfile = yield* loadQualityProfile(db, "Missing");
        assertEquals(fallbackProfile, null);
      }),
    ),
);

it.scoped("operations repository helpers load anime release rules and episode state", () =>
  withTestDbEffect((db, _databaseFile) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(anime).values({
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
        }),
      );
      yield* Effect.promise(() =>
        db.insert(releaseProfiles).values([
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
            rules: encodeReleaseProfileRules([{ rule_type: "must", score: 0, term: "1080p" }]),
          },
          {
            id: 3,
            name: "Ignored",
            enabled: true,
            isGlobal: false,
            rules: encodeReleaseProfileRules([{ rule_type: "must_not", score: 0, term: "Dub" }]),
          },
        ]),
      );
      yield* Effect.promise(() =>
        db.insert(episodes).values({
          animeId: 20,
          number: 1,
          title: null,
          aired: null,
          downloaded: true,
          filePath: "/library/Naruto/Naruto - 01.mkv",
        }),
      );

      const animeRow = yield* requireAnime(db, 20);
      assertEquals(animeRow.titleRomaji, "Naruto");

      const releaseRules = yield* loadReleaseRules(db, animeRow);
      assertEquals(releaseRules, [
        { rule_type: "preferred", score: 10, term: "SubsPlease" },
        { rule_type: "must", score: 0, term: "1080p" },
      ]);

      const episodeState = yield* loadCurrentEpisodeState(db, 20, 1);
      assertEquals(episodeState, {
        downloaded: true,
        filePath: "/library/Naruto/Naruto - 01.mkv",
      });
      assertEquals(yield* loadCurrentEpisodeState(db, 20, 2), null);

      const notFoundExit = yield* Effect.exit(requireAnime(db, 999));
      assertEquals(notFoundExit._tag, "Failure");
      if (notFoundExit._tag === "Failure") {
        const failure = Cause.failureOption(notFoundExit.cause);
        assertNotEquals(failure._tag, "None");
        if (failure._tag === "Some") {
          assertEquals(failure.value instanceof OperationsAnimeNotFoundError, true);
        }
      }
    }),
  ),
);

it("operations repository helpers encode and decode download provenance", () => {
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

it.scoped("operations repository helpers load download presentation contexts", () =>
  withTestDbEffect((db, _databaseFile) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(anime).values({
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
        }),
      );
      yield* Effect.promise(() =>
        db.insert(episodes).values({
          aired: null,
          animeId: 20,
          downloaded: true,
          filePath: "/library/Naruto/Naruto - 01.mkv",
          number: 1,
          title: null,
        }),
      );
      const [row] = yield* Effect.promise(() =>
        db
          .insert(schema.downloads)
          .values({
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
          })
          .returning(),
      );

      const contexts = yield* Effect.promise(() => loadDownloadPresentationContexts(db, [row]));

      assertEquals(contexts.get(row.id), {
        animeImage: "https://example.com/naruto.jpg",
        importedPath: "/library/Naruto/Naruto - 01.mkv",
      });
    }),
  ),
);

it.scoped("operations repository helpers chunk large download event context lookups", () =>
  withTestDbEffect((db, _databaseFile) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(anime).values({
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
        }),
      );

      const insertedDownloads = yield* Effect.promise(() =>
        db
          .insert(schema.downloads)
          .values(
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
          )
          .returning(),
      );

      const eventRows = insertedDownloads.map(
        (row, index) =>
          ({
            animeId: 20,
            createdAt: `2024-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
            downloadId: row.id,
            eventType: "download.queued",
            fromStatus: null,
            id: index + 1,
            message: `Queued Naruto - ${index + 1}`,
            metadata: null,
            toStatus: "queued",
          }) satisfies typeof schema.downloadEvents.$inferSelect,
      );

      const contexts = yield* Effect.promise(() =>
        loadDownloadEventPresentationContexts(db, eventRows),
      );

      assertEquals(contexts.size, 1_005);
      assertEquals(contexts.get(eventRows[1_004]!.id), {
        animeImage: "https://example.com/naruto.jpg",
        animeTitle: "Naruto",
        torrentName: "Naruto - 1005",
      });
    }),
  ),
);

const withTestDbEffect = Effect.fn("OperationsRepositoryDbTest.withTestDbEffect")(function* <
  A,
  E,
  R,
>(run: (db: AppDatabase, databaseFile: string) => Effect.Effect<A, E, R>) {
  return yield* withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db, databaseFile) => run(db as AppDatabase, databaseFile),
    schema,
  });
});
