import { assert, it } from "@effect/vitest";
import { Cause, Effect, Option, Schema } from "effect";

import * as schema from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { anime, appConfig, episodes, qualityProfiles, releaseProfiles } from "@/db/schema.ts";
import {
  encodeConfigCore,
  encodeNumberList,
  encodeQualityProfileRow,
  encodeReleaseProfileRules,
} from "@/features/system/config-codec.ts";
import { ConfigCoreSchema } from "@/features/system/config-schema.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
import {
  getConfigLibraryPath,
  currentImportMode,
  currentNamingSettings,
  loadRuntimeConfig,
} from "@/features/operations/repository/config-repository.ts";
import {
  decodeDownloadSourceMetadata,
  encodeDownloadSourceMetadata,
} from "@/features/operations/repository/download-repository.ts";
import {
  loadCurrentEpisodeState,
  requireAnime,
} from "@/features/operations/repository/anime-repository.ts";
import {
  loadQualityProfile,
  loadReleaseRules,
} from "@/features/operations/repository/profile-repository.ts";
import { OperationsAnimeNotFoundError } from "@/features/operations/errors.ts";

it.scoped(
  "operations repository helpers load runtime config and config-backed library settings",
  () =>
    withSqliteTestDbEffect({
      run: (db, databaseFile) =>
        Effect.gen(function* () {
          const defaults = makeDefaultConfig(databaseFile);
          const encodedDefaults = yield* Schema.encode(ConfigCoreSchema)(defaults);
          const decodedConfig = yield* Schema.decodeUnknown(ConfigCoreSchema)({
            ...encodedDefaults,
            library: {
              ...encodedDefaults.library,
              import_mode: "move",
              library_path: "/anime-library",
            },
          });
          const configData = yield* encodeConfigCore(decodedConfig);
          const qualityProfileRow = yield* encodeQualityProfileRow({
            allowed_qualities: ["1080p", "720p"],
            cutoff: "1080p",
            max_size: "4GB",
            min_size: null,
            name: "Default",
            seadex_preferred: true,
            upgrade_allowed: true,
          });

          yield* Effect.promise(() =>
            db.insert(appConfig).values({
              id: 1,
              data: configData,
              updatedAt: "2024-01-01T00:00:00.000Z",
            }),
          );
          yield* Effect.promise(() => db.insert(qualityProfiles).values(qualityProfileRow));

          const runtimeConfig = yield* loadRuntimeConfig(db);
          assert.deepStrictEqual(runtimeConfig.library.library_path, "/anime-library");
          assert.deepStrictEqual(runtimeConfig.library.import_mode, "move");
          assert.deepStrictEqual(runtimeConfig.profiles.length, 1);
          const [firstProfile] = runtimeConfig.profiles;
          assert.deepStrictEqual(firstProfile !== undefined, true);
          if (!firstProfile) {
            return;
          }
          assert.deepStrictEqual(firstProfile.name, "Default");

          assert.deepStrictEqual(yield* getConfigLibraryPath(db), "/anime-library");
          assert.deepStrictEqual(yield* currentImportMode(db), "move");

          const namingSettings = yield* currentNamingSettings(db);
          assert.deepStrictEqual(namingSettings.namingFormat, defaults.library.naming_format);
          assert.deepStrictEqual(
            namingSettings.movieNamingFormat,
            defaults.library.movie_naming_format,
          );
          assert.deepStrictEqual(namingSettings.preferredTitle, defaults.library.preferred_title);

          const storedProfile = yield* loadQualityProfile(db, "Default");
          assert.deepStrictEqual(storedProfile._tag, "Some");
          if (storedProfile._tag === "Some") {
            assert.deepStrictEqual(storedProfile.value.max_size, "4GB");
          }

          const fallbackProfile = yield* loadQualityProfile(db, "Missing");
          assert.deepStrictEqual(fallbackProfile, Option.none());
        }),
      schema,
    }),
);

it.scoped("operations repository helpers load anime release rules and episode state", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile) =>
      Effect.gen(function* () {
        const releaseProfileIds = yield* encodeNumberList([2]);
        const globalRules = yield* encodeReleaseProfileRules([
          { rule_type: "preferred", score: 10, term: "SubsPlease" },
        ]);
        const assignedRules = yield* encodeReleaseProfileRules([
          { rule_type: "must", score: 0, term: "1080p" },
        ]);
        const ignoredRules = yield* encodeReleaseProfileRules([
          { rule_type: "must_not", score: 0, term: "Dub" },
        ]);

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
            releaseProfileIds,
          }),
        );
        yield* Effect.promise(() =>
          db.insert(releaseProfiles).values([
            {
              id: 1,
              name: "Global",
              enabled: true,
              isGlobal: true,
              rules: globalRules,
            },
            {
              id: 2,
              name: "Assigned",
              enabled: true,
              isGlobal: false,
              rules: assignedRules,
            },
            {
              id: 3,
              name: "Ignored",
              enabled: true,
              isGlobal: false,
              rules: ignoredRules,
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
        assert.deepStrictEqual(animeRow.titleRomaji, "Naruto");

        const releaseRules = yield* loadReleaseRules(db, animeRow);
        assert.deepStrictEqual(releaseRules, [
          { rule_type: "preferred", score: 10, term: "SubsPlease" },
          { rule_type: "must", score: 0, term: "1080p" },
        ]);

        const episodeState = yield* loadCurrentEpisodeState(db, 20, 1);
        assert.deepStrictEqual(episodeState._tag, "Some");
        if (episodeState._tag === "Some") {
          assert.deepStrictEqual(episodeState.value, {
            downloaded: true,
            filePath: "/library/Naruto/Naruto - 01.mkv",
          });
        }
        assert.deepStrictEqual(yield* loadCurrentEpisodeState(db, 20, 2), Option.none());

        const notFoundExit = yield* Effect.exit(requireAnime(db, 999));
        assert.deepStrictEqual(notFoundExit._tag, "Failure");
        if (notFoundExit._tag === "Failure") {
          const failure = Cause.failureOption(notFoundExit.cause);
          assert.deepStrictEqual(failure._tag, "Some");
          if (failure._tag === "Some") {
            assert.deepStrictEqual(failure.value instanceof OperationsAnimeNotFoundError, true);
          }
        }
      }),
    schema,
  }),
);

it.effect("operations repository helpers encode and decode download provenance", () =>
  Effect.gen(function* () {
    const encoded = yield* encodeDownloadSourceMetadata({
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

    assert.deepStrictEqual(yield* decodeDownloadSourceMetadata(encoded), {
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
  }),
);

it.effect("operations repository metadata decoders fail for corrupt stored JSON", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(decodeDownloadSourceMetadata("not-json"));

    assert.deepStrictEqual(exit._tag, "Failure");
    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag === "None", false);
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "StoredDataError");
      }
    }
  }),
);
