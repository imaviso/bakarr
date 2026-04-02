import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { Cause, Effect, Option, Schema } from "effect";
import { ConfigCoreSchema } from "@/features/system/config-schema.ts";

import * as schema from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { anime, appConfig, episodes, qualityProfiles, releaseProfiles } from "@/db/schema.ts";
import {
  encodeConfigCore,
  encodeNumberList,
  encodeQualityProfileRow,
  encodeReleaseProfileRules,
} from "@/features/system/config-codec.ts";
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
    withTestDbEffect((db, databaseFile) =>
      Effect.gen(function* () {
        const defaults = makeDefaultConfig(databaseFile);

        yield* Effect.promise(() =>
          db.insert(appConfig).values({
            id: 1,
            data: (() => {
              const base = Schema.encodeSync(ConfigCoreSchema)(defaults);
              return encodeConfigCore({
                ...base,
                library: { ...base.library, import_mode: "move", library_path: "/anime-library" },
              });
            })(),
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
        assert.deepStrictEqual(runtimeConfig.library.library_path, "/anime-library");
        assert.deepStrictEqual(runtimeConfig.library.import_mode, "move");
        assert.deepStrictEqual(runtimeConfig.profiles.length, 1);
        assert.deepStrictEqual(runtimeConfig.profiles[0].name, "Default");

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
        assert.notDeepStrictEqual(storedProfile, null);
        assert.deepStrictEqual(storedProfile!.max_size, "4GB");

        const fallbackProfile = yield* loadQualityProfile(db, "Missing");
        assert.deepStrictEqual(fallbackProfile, null);
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
        assert.notDeepStrictEqual(failure._tag, "None");
        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value instanceof OperationsAnimeNotFoundError, true);
        }
      }
    }),
  ),
);

it.effect("operations repository helpers encode and decode download provenance", () =>
  Effect.gen(function* () {
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
      assert.notDeepStrictEqual(failure._tag, "None");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "OperationsStoredDataError");
      }
    }
  }),
);

const withTestDbEffect = Effect.fn("OperationsRepositoryDbTest.withTestDbEffect")(function* <
  A,
  E,
  R,
>(run: (db: AppDatabase, databaseFile: string) => Effect.Effect<A, E, R>) {
  return yield* withSqliteTestDbEffect({
    run: (db, databaseFile) => run(db as AppDatabase, databaseFile),
    schema,
  });
});
