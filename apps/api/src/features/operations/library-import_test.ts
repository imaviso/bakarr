import { assert, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";

import * as schema from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { appConfig, episodes } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  analyzeScannedFile,
  buildRenamePreview,
  findBestLocalAnimeMatch,
  titlesMatch,
  toAnimeSearchCandidate,
} from "@/features/operations/library-import.ts";
import { anime } from "@/db/schema.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { encodeConfigCore, toConfigCore } from "@/features/system/config-codec.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";

it("analyzeScannedFile strips release noise and extracts metadata", () => {
  const result = analyzeScannedFile({
    name: "[SubsPlease] Naruto Season 2 - S02E03 [1080p] [HEVC].mkv",
    path: "/library/[SubsPlease] Naruto Season 2 - S02E03 [1080p] [HEVC].mkv",
  });
  const parsed = result.scanned;

  assert.deepStrictEqual(parsed.episode_number, 3);
  assert.deepStrictEqual(parsed.coverage_summary, undefined);
  assert.deepStrictEqual(parsed.group, "SubsPlease");
  assert.deepStrictEqual(parsed.resolution, "1080p");
  assert.deepStrictEqual(parsed.season, 2);
});

it("analyzeScannedFile handles Sonarr and Plex style episode names", () => {
  const result = analyzeScannedFile({
    name: "Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You♡ Quit Playing the Guitar!!! [v2 WEBDL-1080p Proper][AAC 2.0][AVC]-SubsPlus+.mkv",
    path: "/library/Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You♡ Quit Playing the Guitar!!! [v2 WEBDL-1080p Proper][AAC 2.0][AVC]-SubsPlus+.mkv",
  });
  const parsed = result.scanned;

  assert.deepStrictEqual(parsed.episode_number, 1);
  assert.deepStrictEqual(parsed.coverage_summary, undefined);
  assert.deepStrictEqual(parsed.episode_title, "Good Day to You♡ Quit Playing the Guitar!!!");
  assert.deepStrictEqual(parsed.audio_channels, "2.0");
  assert.deepStrictEqual(parsed.audio_codec, "AAC");
  assert.deepStrictEqual(parsed.match_reason, "Parsed S01E01 from the filename");
  assert.deepStrictEqual(parsed.quality, "WEB-DL");
  assert.deepStrictEqual(parsed.resolution, "1080p");
  assert.deepStrictEqual(parsed.season, 1);
  assert.deepStrictEqual(parsed.video_codec, "AVC");
});

it("analyzeScannedFile preserves multi-episode local ranges", () => {
  const result = analyzeScannedFile({
    name: "Show Name - 1x01-1x02 - Premiere.mkv",
    path: "/library/Show Name - 1x01-1x02 - Premiere.mkv",
  });
  const parsed = result.scanned;

  assert.deepStrictEqual(parsed.episode_number, 1);
  assert.deepStrictEqual(parsed.coverage_summary, "Episodes 1-2");
  assert.deepStrictEqual(parsed.episode_numbers, [1, 2]);
  assert.deepStrictEqual(parsed.episode_title, undefined);
  assert.deepStrictEqual(parsed.match_reason, "Parsed S01E01-E02 from the filename");
  assert.deepStrictEqual(parsed.season, 1);
  assert.deepStrictEqual(parsed.warnings, undefined);
});

it("analyzeScannedFile skips extras and samples", () => {
  const extra = analyzeScannedFile({
    name: "Featurette.mkv",
    path: "/library/Extras/Featurette.mkv",
  });
  assert.deepStrictEqual(extra.skipped !== undefined, true);
  assert.deepStrictEqual(extra.skipped!.reason.length > 0, true);

  const sample = analyzeScannedFile({
    name: "sample-Show.S01E01.mkv",
    path: "/library/sample-Show.S01E01.mkv",
  });
  assert.deepStrictEqual(sample.skipped !== undefined, true);
});

it("analyzeScannedFile populates source_identity for season episodes", () => {
  const result = analyzeScannedFile({
    name: "Show.S02E03.mkv",
    path: "/library/Show.S02E03.mkv",
  });
  const parsed = result.scanned;

  assert.deepStrictEqual(parsed.source_identity?.scheme, "season");
  assert.deepStrictEqual(parsed.source_identity?.season, 2);
  assert.deepStrictEqual(parsed.source_identity?.episode_numbers, [3]);
  assert.deepStrictEqual(parsed.source_identity?.label, "S02E03");
  assert.deepStrictEqual(parsed.episode_number, 3);
  assert.deepStrictEqual(parsed.season, 2);
});

it("analyzeScannedFile populates source_identity for daily episodes", () => {
  const result = analyzeScannedFile({
    name: "Show.2025-03-14.mkv",
    path: "/library/Show.2025-03-14.mkv",
  });
  const parsed = result.scanned;

  assert.deepStrictEqual(parsed.source_identity?.scheme, "daily");
  assert.deepStrictEqual(parsed.air_date, "2025-03-14");
  assert.deepStrictEqual(parsed.coverage_summary, "Air date 2025-03-14");
  assert.deepStrictEqual(
    parsed.match_reason,
    "Parsed a daily air date from the filename; choose the episode mapping before import",
  );
  assert.deepStrictEqual(parsed.source_identity?.air_dates, ["2025-03-14"]);
  assert.deepStrictEqual(parsed.needs_manual_mapping, true);
  assert.deepStrictEqual(parsed.warnings, [
    "Parsed a daily air date; set the episode number before import",
  ]);
});

it("analyzeScannedFile marks unknown files as needing manual mapping", () => {
  const result = analyzeScannedFile({
    name: "random_video.mkv",
    path: "/library/random_video.mkv",
  });
  const parsed = result.scanned;

  assert.deepStrictEqual(parsed.needs_manual_mapping, true);
  assert.deepStrictEqual(parsed.episode_number, 0);
  assert.deepStrictEqual(
    parsed.match_reason,
    "No reliable episode identity found in the filename; review this file before import",
  );
  assert.deepStrictEqual(parsed.warnings, ["No reliable episode identity found in filename"]);
});

it.scoped("buildRenamePreview fills naming tokens from existing file metadata", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const rootFolder = "/mnt/media2/Shows/Nisemonogatari (2012)";
        const namingFormat =
          "{title} - S{season:02}E{episode:02} - {episode_title} [{quality} {resolution}][{video_codec}][{audio_codec} {audio_channels}][{group}]";
        const testConfig = makeTestConfig(databaseFile, (config) => ({
          ...config,
          library: { ...config.library, naming_format: namingFormat },
        }));
        const encodedConfig = yield* encodeConfigCore(yield* toConfigCore(testConfig));

        yield* Effect.tryPromise(() =>
          appDb.insert(appConfig).values({
            id: 1,
            data: encodedConfig,
            updatedAt: "2024-01-01T00:00:00.000Z",
          }),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(anime).values(
            makeAnimeRow({
              episodeCount: 11,
              rootFolder,
              startDate: "2012-01-08",
              titleRomaji: "Nisemonogatari",
            }),
          ),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(episodes).values({
            aired: null,
            animeId: 1,
            downloaded: true,
            filePath: `${rootFolder}/Season 1/Nisemonogatari - S01E01 - Karen Bee, Part 1 -[1920x1080]-[hevc]-[aac][MTBB].mkv`,
            number: 1,
            title: null,
          }),
        );

        const preview = yield* buildRenamePreview(appDb, 1, testConfig);
        const firstPreview = preview[0];
        assert(firstPreview);

        assert.deepStrictEqual(preview.length, 1);
        assert.deepStrictEqual(
          firstPreview.new_filename,
          "Nisemonogatari - S01E01 - Karen Bee, Part 1 [1080p][HEVC][AAC][MTBB].mkv",
        );
        assert.deepStrictEqual(firstPreview.fallback_used, undefined);
        assert.deepStrictEqual(firstPreview.format_used, namingFormat);
        assert.deepStrictEqual(firstPreview.metadata_snapshot?.episode_title, "Karen Bee, Part 1");
        assert.deepStrictEqual(firstPreview.metadata_snapshot?.title_source, "preferred_romaji");
        assert.deepStrictEqual(firstPreview.metadata_snapshot?.video_codec, "HEVC");
      }),
    schema,
  }),
);

it.scoped("buildRenamePreview respects preferred English title and movie naming format", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const testConfig = makeTestConfig(databaseFile, (config) => ({
          ...config,
          library: {
            ...config.library,
            movie_naming_format: "{title} ({year})",
            preferred_title: "english",
          },
        }));
        const encodedConfig = yield* encodeConfigCore(yield* toConfigCore(testConfig));

        yield* Effect.tryPromise(() =>
          appDb.insert(appConfig).values({
            id: 1,
            data: encodedConfig,
            updatedAt: "2024-01-01T00:00:00.000Z",
          }),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(anime).values(
            makeAnimeRow({
              format: "MOVIE",
              rootFolder: "/mnt/media2/Movies/Kimi no Na wa.",
              startDate: "2016-08-26",
              titleEnglish: "Your Name.",
              titleNative: "君の名は。",
              titleRomaji: "Kimi no Na wa.",
            }),
          ),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(episodes).values({
            aired: null,
            animeId: 1,
            downloaded: true,
            filePath: "/mnt/media2/Movies/Kimi no Na wa./movie-source-file.mkv",
            number: 1,
            title: null,
          }),
        );

        const preview = yield* buildRenamePreview(appDb, 1, testConfig);
        const firstPreview = preview[0];
        assert(firstPreview);

        assert.deepStrictEqual(preview.length, 1);
        assert.deepStrictEqual(firstPreview.new_filename, "Your Name. (2016).mkv");
        assert.deepStrictEqual(firstPreview.format_used, "{title} ({year})");
        assert.deepStrictEqual(firstPreview.metadata_snapshot?.title, "Your Name.");
        assert.deepStrictEqual(firstPreview.metadata_snapshot?.title_source, "preferred_english");
      }),
    schema,
  }),
);

it.scoped("buildRenamePreview reports fallback when season metadata is missing", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const namingFormat = "{title} - S{season:02}E{episode:02}";
        const testConfig = makeTestConfig(databaseFile, (config) => ({
          ...config,
          library: { ...config.library, naming_format: namingFormat },
        }));
        const encodedConfig = yield* encodeConfigCore(yield* toConfigCore(testConfig));

        yield* Effect.tryPromise(() =>
          appDb.insert(appConfig).values({
            id: 1,
            data: encodedConfig,
            updatedAt: "2024-01-01T00:00:00.000Z",
          }),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(anime).values(
            makeAnimeRow({
              rootFolder: "/library/Show",
              titleRomaji: "Show",
            }),
          ),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(episodes).values({
            aired: null,
            animeId: 1,
            downloaded: true,
            filePath: "/downloads/Show - 01.mkv",
            number: 1,
            title: null,
          }),
        );

        const preview = yield* buildRenamePreview(appDb, 1, testConfig);
        const firstPreview = preview[0];
        assert(firstPreview);

        assert.deepStrictEqual(firstPreview.new_filename, "Show - 01.mkv");
        assert.deepStrictEqual(firstPreview.fallback_used, true);
        assert.deepStrictEqual(firstPreview.missing_fields, ["season"]);
        assert.deepStrictEqual(firstPreview.warnings?.length, 2);
        assert.deepStrictEqual(firstPreview.metadata_snapshot?.source_identity?.label, "01");
      }),
    schema,
  }),
);

it("findBestLocalAnimeMatch handles title normalization and rejects weak matches", () => {
  const naruto = makeAnimeRow({
    addedAt: "2024-01-01T00:00:00.000Z",
    bannerImage: null,
    coverImage: null,
    description: null,
    endDate: null,
    episodeCount: 24,
    format: "TV",
    genres: "Action",
    id: 20,
    malId: null,
    monitored: true,
    profileName: "Default",
    releaseProfileIds: "[]",
    rootFolder: "/library/Naruto II",
    score: null,
    startDate: null,
    status: "RELEASING",
    studios: "Studio Pierrot",
    titleEnglish: "Naruto Season 2",
    titleNative: null,
    titleRomaji: "Naruto II",
  });
  const bleach = makeAnimeRow({
    ...naruto,
    id: 21,
    rootFolder: "/library/Bleach",
    titleEnglish: "Bleach",
    titleRomaji: "Bleach",
  });

  assert.deepStrictEqual(findBestLocalAnimeMatch("Naruto Season 2", [naruto, bleach])?.id, 20);
  assert.deepStrictEqual(
    findBestLocalAnimeMatch("Completely Different Show", [naruto, bleach]),
    undefined,
  );
});

it.effect("titlesMatch checks normalized candidate titles", () =>
  Effect.gen(function* () {
    const candidate = yield* toAnimeSearchCandidate(
      makeAnimeRow({
        addedAt: "2024-01-01T00:00:00.000Z",
        bannerImage: "/images/banner.jpg",
        coverImage: null,
        description: "Hero school",
        endDate: "2020-06-01",
        endYear: 2020,
        episodeCount: 12,
        format: "TV",
        genres: '["Action","School"]',
        id: 30,
        malId: null,
        monitored: true,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        releaseProfileIds: "[]",
        rootFolder: "/library/My Hero Academia",
        score: null,
        startDate: "2019-04-06",
        startYear: 2019,
        status: "FINISHED",
        studios: "Bones",
        titleEnglish: "My Hero Academia Season 2",
        titleNative: "Boku no Hero Academia 2",
        titleRomaji: "Boku no Hero Academia II",
      }),
    );

    assert.deepStrictEqual(titlesMatch("My Hero Academia 2", candidate), true);
    assert.deepStrictEqual(titlesMatch("One Piece", candidate), false);
    assert.deepStrictEqual(candidate.banner_image, "/images/banner.jpg");
    assert.deepStrictEqual(candidate.description, "Hero school");
    assert.deepStrictEqual(candidate.end_date, "2020-06-01");
    assert.deepStrictEqual(candidate.end_year, 2020);
    assert.deepStrictEqual(candidate.genres, ["Action", "School"]);
    assert.deepStrictEqual(candidate.season, "spring");
    assert.deepStrictEqual(candidate.season_year, 2019);
    assert.deepStrictEqual(candidate.start_date, "2019-04-06");
    assert.deepStrictEqual(candidate.start_year, 2019);
  }),
);

it.effect("toAnimeSearchCandidate fails for corrupt stored genres", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      toAnimeSearchCandidate(
        makeAnimeRow({
          genres: "not-json",
          id: 31,
          titleRomaji: "Broken Show",
        }),
      ),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value instanceof OperationsStoredDataError, true);
      }
    }
  }),
);

function makeAnimeRow(overrides: Partial<typeof anime.$inferSelect>): typeof anime.$inferSelect {
  return {
    addedAt: "2024-01-01T00:00:00.000Z",
    bannerImage: null,
    coverImage: null,
    description: null,
    endDate: null,
    episodeCount: 12,
    format: "TV",
    genres: "Action",
    id: 1,
    malId: null,
    monitored: true,
    profileName: "Default",
    releaseProfileIds: "[]",
    rootFolder: "/library/Anime",
    score: null,
    startDate: null,
    startYear: null,
    endYear: null,
    nextAiringAt: null,
    nextAiringEpisode: null,
    status: "FINISHED",
    studios: "Studio",
    titleEnglish: null,
    titleNative: null,
    titleRomaji: "Anime",
    synonyms: null,
    relatedAnime: null,
    recommendedAnime: null,
    ...overrides,
  };
}
